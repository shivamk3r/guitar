/// <reference types="vite/client" />

declare module "*.worklet.ts?worker&url" {
  const src: string;
  export default src;
}

declare module "*?url" {
  const src: string;
  export default src;
}
