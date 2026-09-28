import { BALANCE, Balance } from './balance';
import { ConditionId } from './conditions';
import { newRound, resolveExchange, timeoutChoice } from './rules';
import { BoutSettings, BoutState, Choice, ExchangeResult, FeintState, Pair, Side, other } from './types';

export function defaultSettings(balance: Balance = BALANCE): BoutSettings {
  return { winsNeeded: balance.bout.defaultWins, timerSec: balance.timing.defaultTimerSec };
}

/** Приводит настройки к разрешённым значениям из balance.json. */
export function sanitizeSettings(input: Partial<BoutSettings> | undefined, balance: Balance = BALANCE): BoutSettings {
  const d = defaultSettings(balance);
  const winsNeeded = balance.bout.winsOptions.includes(Number(input?.winsNeeded)) ? Number(input?.winsNeeded) : d.winsNeeded;
  const timerSec = balance.timing.timerOptionsSec.includes(Number(input?.timerSec)) ? Number(input?.timerSec) : d.timerSec;
  return { winsNeeded, timerSec };
}

export function newBout(settings: BoutSettings, balance: Balance = BALANCE): BoutState {
  return {
    settings,
    wins: [0, 0],
    roundNo: 1,
    round: newRound(['locked', 'locked'], balance),
    roundWinners: [],
    history: [],
    lastChoices: [null, null],
    winner: null,
  };
}

/** Выбор по таймауту для бойца side. */
export function autoChoice(bout: BoutState, side: Side): Choice {
  return timeoutChoice(bout.lastChoices[side]);
}

export interface ExchangeOutcome {
  bout: BoutState;
  result: ExchangeResult;
  roundOver: boolean;
  boutOver: boolean;
}

/** Играет сход. Если раунд окончен, бой остаётся на старом раунде до startNextRound. */
export function playExchange(bout: BoutState, choices: Pair<Choice>, balance: Balance = BALANCE): ExchangeOutcome {
  if (bout.winner !== null) throw new Error('Бой уже окончен');
  const { state, result } = resolveExchange(bout.round, choices, bout.roundNo, balance);
  const wins: Pair<number> = [...bout.wins];
  const roundWinners = [...bout.roundWinners];
  let winner: Side | null = null;
  if (result.roundWinner !== null) {
    wins[result.roundWinner] += 1;
    roundWinners.push(result.roundWinner);
    if (wins[result.roundWinner] >= bout.settings.winsNeeded) winner = result.roundWinner;
  }
  const next: BoutState = {
    ...bout,
    wins,
    round: state,
    roundWinners,
    history: [...bout.history, result],
    lastChoices: [result.sides[0].choice, result.sides[1].choice],
    winner,
  };
  return { bout: next, result, roundOver: result.roundWinner !== null, boutOver: winner !== null };
}

/** Новый раунд: проигравший прошлый раунд начинает с готовым Финтом; Яма может сменить условие. */
export function startNextRound(bout: BoutState, balance: Balance = BALANCE, condition: ConditionId = 'clean'): BoutState {
  const lastWinner = bout.roundWinners[bout.roundWinners.length - 1];
  const feints: Pair<FeintState> = ['locked', 'locked'];
  if (lastWinner !== undefined) feints[other(lastWinner)] = 'ready';
  return { ...bout, roundNo: bout.roundNo + 1, round: newRound(feints, balance, condition) };
}
