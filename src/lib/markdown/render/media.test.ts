import { describe, it, expect } from "bun:test";
import { youtubeId } from "./media.ts";

// youtubeId gates the facade AND produces the id interpolated into the client's
// iframe src, so its parsing (every YouTube URL shape) and rejection (non-YouTube,
// wrong-length ids, junk) are pinned here. `dQw4w9WgXcQ` is a public, well-known id.

describe("youtubeId", () => {
  it("extracts the id from a watch URL", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts from youtu.be short links", () => {
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts from embed and shorts URLs", () => {
    expect(youtubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("ignores extra query params on a watch URL", () => {
    expect(youtubeId("https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s")).toBe("dQw4w9WgXcQ");
  });

  it("rejects non-YouTube and malformed URLs", () => {
    expect(youtubeId("https://vimeo.com/12345")).toBeNull();
    expect(youtubeId("https://youtube.com/watch?v=short")).toBeNull(); // wrong id length
    expect(youtubeId("not a url")).toBeNull();
    expect(youtubeId("https://youtube.com/")).toBeNull();
  });
});
