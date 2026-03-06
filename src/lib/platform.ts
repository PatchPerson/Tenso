export const isMac = navigator.platform.toUpperCase().includes("MAC");

const modSymbol = isMac ? "⌘" : "Ctrl";
const altSymbol = isMac ? "⌥" : "Alt";
const shiftSymbol = isMac ? "⇧" : "Shift";

export function kbd(shortcut: string): string {
  return shortcut
    .replace(/Mod/g, modSymbol)
    .replace(/Alt/g, altSymbol)
    .replace(/Shift/g, shiftSymbol)
    .replace(/Del/g, isMac ? "⌫" : "Del");
}
