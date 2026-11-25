export function keyboardForwardInput(keys) {
  return Number(keys.has('KeyW') || keys.has('ArrowUp')) -
    Number(keys.has('KeyS') || keys.has('ArrowDown'));
}
