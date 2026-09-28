import { randomInt, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  BoutHost,
  BoutSettings,
  CODE_ALPHABET,
  CODE_LENGTH,
  ClientMsg,
  EMOTES,
  Scheduler,
  ServerMsg,
  FighterId,
  Side,
  cleanCode,
  cleanFighter,
  cleanName,
  other,
  sanitizeSettings,
} from '@hj/shared';

const scheduler: Scheduler = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as NodeJS.Timeout),
};

/** Сколько живёт комната, где никого нет. */
const IDLE_ROOM_MS = 10 * 60 * 1000;
/** Сколько ждёт соперника комната-лобби. */
const LOBBY_TTL_MS = 60 * 60 * 1000;
const MAX_ROOMS = 2000;

interface Seat {
  token: string;
  name: string;
  fighter: FighterId;
  ws: WebSocket | null;
}

export interface ConnCtx {
  ws: WebSocket;
  room: Room | null;
  side: Side | null;
}

function send(ws: WebSocket | null, msg: ServerMsg): void {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

export class Room {
  readonly seats: [Seat, Seat | null];
  host: BoutHost | null = null;
  readonly createdAt = Date.now();
  lastSeen = Date.now();

  constructor(
    readonly code: string,
    readonly settings: BoutSettings,
    owner: Seat,
  ) {
    this.seats = [owner, null];
  }

  seat(side: Side): Seat | null {
    return this.seats[side];
  }

  isEmpty(): boolean {
    return this.seats.every((s) => !s || !s.ws);
  }

  startBout(): void {
    const guest = this.seats[1];
    if (!guest) return;
    this.host = new BoutHost({
      settings: this.settings,
      names: [this.seats[0].name, guest.name],
      fighters: [this.seats[0].fighter, guest.fighter],
      scheduler,
      onChange: () => this.broadcast(),
    });
    this.host.connected = [!!this.seats[0].ws, !!guest.ws];
    this.broadcast();
  }

  broadcast(): void {
    if (!this.host) return;
    for (const side of [0, 1] as Side[]) {
      const seat = this.seats[side];
      if (seat?.ws) send(seat.ws, { t: 'state', view: this.host.view(side) });
    }
  }

  sendLobby(side: Side): void {
    const seat = this.seats[side];
    if (!seat) return;
    send(seat.ws, { t: 'lobby', code: this.code, token: seat.token, name: seat.name, settings: this.settings });
  }

  dispose(): void {
    this.host?.dispose();
    for (const seat of this.seats) seat?.ws?.close();
  }
}

export class Rooms {
  private readonly rooms = new Map<string, Room>();

  get size(): number {
    return this.rooms.size;
  }

  private newCode(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Нет свободных кодов');
  }

  /** Обрабатывает одно сообщение клиента. */
  handle(ws: WebSocket, ctx: ConnCtx, msg: ClientMsg): void {
    switch (msg.t) {
      case 'create':
        return this.create(ws, ctx, msg.name, msg.fighter, msg.settings);
      case 'peek':
        return this.peek(ws, msg.code);
      case 'join':
        return this.join(ws, ctx, msg.code, msg.name, msg.fighter, msg.token);
      case 'leave':
        return this.detach(ctx, true);
      default:
        return this.inBout(ws, ctx, msg);
    }
  }

  private create(ws: WebSocket, ctx: ConnCtx, rawName: string, rawFighter: unknown, rawSettings: Partial<BoutSettings> | undefined): void {
    this.detach(ctx, true);
    if (this.rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', message: 'Сервер переполнен, попробуй позже' });
    const code = this.newCode();
    const room = new Room(code, sanitizeSettings(rawSettings), { token: randomUUID(), name: cleanName(rawName), fighter: cleanFighter(rawFighter), ws });
    this.rooms.set(code, room);
    ctx.room = room;
    ctx.side = 0;
    room.sendLobby(0);
  }

  private peek(ws: WebSocket, rawCode: string): void {
    const code = cleanCode(rawCode);
    const room = code ? this.rooms.get(code) : undefined;
    send(ws, { t: 'peek', code: code ?? '', host: room ? room.seats[0].name : null, open: !!room && !room.seats[1] });
  }

  private join(ws: WebSocket, ctx: ConnCtx, rawCode: string, rawName: string, rawFighter: unknown, token: string | undefined): void {
    const code = cleanCode(rawCode);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) return send(ws, { t: 'error', message: 'Бой с таким кодом не найден' });

    // Переподключение по токену.
    const side = ([0, 1] as Side[]).find((s) => token && room.seats[s]?.token === token);
    if (side !== undefined) {
      if (ctx.room !== room || ctx.side !== side) this.detach(ctx, false);
      const seat = room.seats[side]!;
      if (seat.ws && seat.ws !== ws) seat.ws.close(4000, 'replaced');
      seat.ws = ws;
      ctx.room = room;
      ctx.side = side;
      room.lastSeen = Date.now();
      send(ws, { t: 'joined', code: room.code, token: seat.token });
      if (room.host) room.host.setConnected(side, true);
      else room.sendLobby(side);
      return;
    }

    if (room.seats[1]) return send(ws, { t: 'error', message: 'В этом бою уже двое' });
    this.detach(ctx, true);
    const seat: Seat = { token: randomUUID(), name: cleanName(rawName), fighter: cleanFighter(rawFighter), ws };
    if (seat.name === room.seats[0].name) seat.name = `${seat.name.slice(0, 16)} 2`;
    room.seats[1] = seat;
    ctx.room = room;
    ctx.side = 1;
    send(ws, { t: 'joined', code: room.code, token: seat.token });
    room.startBout();
  }

  private inBout(ws: WebSocket, ctx: ConnCtx, msg: ClientMsg): void {
    const room = ctx.room;
    const side = ctx.side;
    if (!room || side === null) return send(ws, { t: 'error', message: 'Ты не в бою' });
    room.lastSeen = Date.now();
    const host = room.host;
    if (!host) return;
    switch (msg.t) {
      case 'choose': {
        const error = host.submit(side, msg.choice);
        if (error) send(ws, { t: 'error', message: error });
        return;
      }
      case 'rematch':
        return host.voteRematch(side);
      case 'skip':
        return host.skipDossier(side);
      case 'emote': {
        const id = Number(msg.id);
        if (!Number.isInteger(id) || id < 0 || id >= EMOTES.length) return;
        if (!host.useEmote(side)) return;
        send(room.seat(side)?.ws ?? null, { t: 'emote', from: 'you', id });
        send(room.seat(other(side))?.ws ?? null, { t: 'emote', from: 'opp', id });
        return;
      }
    }
  }

  /** Соединение ушло из комнаты: отключился или сам вышел. */
  detach(ctx: ConnCtx, intentional: boolean): void {
    const room = ctx.room;
    const side = ctx.side;
    ctx.room = null;
    ctx.side = null;
    if (!room || side === null) return;
    const seat = room.seats[side];
    // Место уже занято новым соединением этого же игрока — старое просто уходит.
    if (!seat || seat.ws !== ctx.ws) return;
    seat.ws = null;
    room.lastSeen = Date.now();
    if (!room.host) {
      // Хозяин сам закрыл лобби — комнату больше никто не ждёт.
      if (intentional && side === 0) this.remove(room);
      return;
    }
    room.host.setConnected(side, false);
    if (room.isEmpty() && intentional) this.remove(room);
  }

  private remove(room: Room): void {
    room.dispose();
    this.rooms.delete(room.code);
  }

  /** Удаляет брошенные комнаты. */
  sweep(now = Date.now()): void {
    for (const room of this.rooms.values()) {
      const idle = room.isEmpty() && now - room.lastSeen > IDLE_ROOM_MS;
      const staleLobby = !room.host && now - room.createdAt > LOBBY_TTL_MS;
      if (idle || staleLobby) this.remove(room);
    }
  }
}
