export function getOperationsQueryError(...messages: Array<string | null | undefined>) {
  const usable = messages.map(message => message?.trim()).filter((message): message is string => Boolean(message));
  return usable.length ? usable.join(" · ") : undefined;
}
