export function queueDetailErrorText(message: string | null | undefined) {
  return message ? `Could not load that signal. ${message}` : "";
}

export function queueActionErrorText(messages: Array<string | null | undefined>) {
  return messages.find(Boolean) || "";
}
