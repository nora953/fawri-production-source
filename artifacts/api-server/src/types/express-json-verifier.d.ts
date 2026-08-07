import "node:http";

declare module "node:http" {
  interface IncomingMessage {
    /** Express populates this before body-parser verify callbacks run. */
    originalUrl?: string;
  }
}
