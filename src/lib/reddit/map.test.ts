import { describe, expect, it } from "vitest";
import { mapSubscribedSubreddits } from "./map";

/** A minimal `/subreddits/mine/subscriber` listing with the fields we consume. */
const LISTING = {
  data: {
    after: "t5_last",
    children: [
      {
        kind: "t5",
        data: {
          name: "t5_2fwo",
          display_name: "programming",
          display_name_prefixed: "r/programming",
          // community_icon is preferred, keeps its query params, and is HTML-escaped.
          community_icon: "https://styles.redditmedia.com/p.png?width=256&amp;s=abc",
          icon_img: "https://b.thumbs.redditmedia.com/ignored.png",
          subscribers: 6_000_000,
          over_18: false,
        },
      },
      {
        kind: "t5",
        data: {
          name: "t5_aww",
          display_name: "aww",
          // No community_icon -> falls back to the classic icon_img.
          icon_img: "https://b.thumbs.redditmedia.com/aww.png",
          subscribers: 34_000_000,
          over_18: false,
        },
      },
      {
        kind: "t5",
        data: {
          name: "t5_nsfw",
          display_name: "somensfw",
          subscribers: 100,
          over_18: true,
        },
      },
      // Non-subreddit child: skipped.
      { kind: "t1", data: { name: "t1_x", display_name: "" } },
      // Malformed (missing name/display_name): skipped.
      { kind: "t5", data: { display_name: "" } },
    ],
  },
};

describe("mapSubscribedSubreddits", () => {
  const subs = mapSubscribedSubreddits(LISTING);

  it("keeps only well-formed t5 children", () => {
    expect(subs.map((s) => s.name)).toEqual(["programming", "aww", "somensfw"]);
  });

  it("prefers community_icon, keeps its params, and un-escapes entities", () => {
    expect(subs[0].iconUrl).toBe("https://styles.redditmedia.com/p.png?width=256&s=abc");
  });

  it("falls back to icon_img when there is no community_icon", () => {
    expect(subs[1].iconUrl).toBe("https://b.thumbs.redditmedia.com/aww.png");
  });

  it("carries id, display name, subscribers, and the NSFW flag", () => {
    expect(subs[0]).toMatchObject({
      id: "t5_2fwo",
      displayName: "r/programming",
      subscribers: 6_000_000,
      over18: false,
    });
    expect(subs[2].over18).toBe(true);
  });

  it("builds a prefixed display name when Reddit omits one", () => {
    expect(subs[1].displayName).toBe("r/aww");
  });

  it("leaves iconUrl undefined when the sub has no icon", () => {
    expect(subs[2].iconUrl).toBeUndefined();
  });

  it("returns an empty array for a malformed payload", () => {
    expect(mapSubscribedSubreddits(null)).toEqual([]);
    expect(mapSubscribedSubreddits({})).toEqual([]);
  });
});
