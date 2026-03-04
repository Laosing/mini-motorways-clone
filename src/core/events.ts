type EventMap = {
  status: string;
};

export class EventBus {
  private listeners: Record<string, Array<(value: string) => void>> = {};

  on<K extends keyof EventMap>(event: K, handler: (value: EventMap[K]) => void): void {
    const key = String(event);
    const queue = this.listeners[key] ?? [];
    queue.push(handler as (value: string) => void);
    this.listeners[key] = queue;
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const queue = this.listeners[String(event)];
    if (!queue) return;
    for (const listener of queue) listener(payload as string);
  }
}
