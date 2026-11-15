// @iwer/devui ships a self-contained ES build without types of its own; it exports what the package root declares.
declare module '@iwer/devui/build/iwer-devui.module.min.js' {
  export { DevUI, DEFAULT_KEYMAP } from '@iwer/devui';
}
