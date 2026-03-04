export type GamePhase = 'Boot' | 'Menu' | 'Play' | 'Pause' | 'GameOver';

export class StateMachine {
  private current: GamePhase = 'Boot';

  get state(): GamePhase {
    return this.current;
  }

  transition(next: GamePhase): void {
    this.current = next;
  }

  is(state: GamePhase): boolean {
    return this.current === state;
  }
}
