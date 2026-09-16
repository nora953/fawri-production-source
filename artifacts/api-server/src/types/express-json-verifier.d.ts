import "http";

declare module "http" {
  interface IncomingMessage {
    /** Express populates this before body-parser verify callbacks run. */
    originalUrl?: string;
  }
}
