# LinkedIn Post Planner — Product Manifest

## What this is

The Post Planner helps someone turn ideas and source material from around the internet into useful LinkedIn drafts that sound like them. It uses the person's own synced LinkedIn posts to understand their voice, then helps them research, shape, and schedule new posts.

It is a writing partner, not an autopilot. The person reviews and controls every draft; the product does not publish automatically.

## The weekly job

The primary workflow is a focused session once a week:

1. Review ideas saved during the week, especially favorited posts from X.
2. Pick the strongest ideas or source material.
3. Pull a small set of the person's recent LinkedIn posts as voice guidance.
4. Generate a few genuinely different LinkedIn draft approaches for each idea.
5. Edit and approve six posts.
6. Put those six posts onto the upcoming schedule.

Saving inspiration should take seconds during the week. The longer research, drafting, and scheduling work belongs in the weekly session.

## Capturing X favorites

The browser extension should import posts the user has favorited on X into a private idea inbox. This is a user-directed import from their own signed-in browser session, not general-purpose scraping of another person's account.

For each favorite, preserve as much original context as is available:

- post text, author, URL, and timestamp;
- quoted or parent posts;
- the surrounding thread when requested;
- linked articles;
- images and media references; and
- the date the item was imported.

The import should be incremental and deduplicated. Removing an item from the idea inbox should not unlike it on X, and unliking it on X should not silently delete notes or drafts already created from it.

X favorites are the first inbox, but the underlying capture model should also support pasted text and URLs without requiring X.

## The core loop

1. Capture an idea or source from X favorites, pasted text, or a public URL.
2. Extract the useful facts, arguments, quotes, and links while preserving the original source.
3. Choose an angle and explain why it is relevant to the person's audience.
4. Draft in the person's established voice, with a few meaningfully different options when useful.
5. Edit, approve, and place the post into a simple content plan.
6. After publishing, connect the resulting LinkedIn analytics back to the draft so the person can learn what worked.

## Writing in the person's voice

The synced LinkedIn post history is the primary voice reference. When drafting, the user can ask the product to pull a few recent or relevant posts and use them as guidance. Those reference posts should remain visible beside the generated drafts so the user understands what informed the result.

The product should learn patterns such as:

- tone, vocabulary, sentence length, and formatting;
- how the person opens and closes posts;
- how often they use stories, lists, questions, links, and calls to action;
- subjects and opinions they return to; and
- patterns the person dislikes or routinely edits out.

The product should never claim to perfectly imitate the person. It should make its assumptions editable and let the person save explicit voice preferences. A draft should feel recognizable without copying sentences from old posts.

For each idea, draft variants should explore meaningfully different approaches rather than lightly rewriting the same output—for example: a personal observation, a practical lesson, a contrarian argument, or a concise explanation. The user chooses the direction and remains the author.

## Source material

The first useful capture flow should support pasted text and public URLs, especially X posts and threads. For every captured source, retain:

- the original URL and author;
- the date captured;
- extracted claims and supporting context;
- any direct quotations, clearly marked; and
- enough provenance to revisit or cite the source while editing.

Cleaning up a source means removing irrelevant page furniture and organizing the material. It does not mean stripping attribution, presenting someone else's idea as original, or reproducing a source wholesale.

## Video and other media

When a saved source includes a video, preserve the source URL and make the media easy to revisit while drafting. Where the platform permits it and the user has the right to download the file, the extension may offer a local download with a useful filename and source metadata.

Video downloading is an optional convenience, not a dependency of the drafting workflow. The product should not bypass access controls, digital-rights protections, or platform restrictions. A transcript or user-authored summary can be used as drafting context when downloading is unavailable.

## Planning experience

The planner should make it easy to move work through a small set of states:

- Ideas
- Researching
- Drafting
- Ready
- Published

Each item can have an intended publish date, topic, source links, working notes, draft variants, voice-reference posts, and the final published LinkedIn URL. The planning screen should make selecting and scheduling six posts for the coming week feel natural. A lightweight calendar or queue is enough initially; campaign automation is not.

## Feedback loop

Once a planned draft becomes a LinkedIn post, the existing analytics data can help answer:

- Which topics and formats earn meaningful engagement?
- Which openings get reach without becoming clickbait?
- Which posts lead to profile views, followers, saves, or sends?
- How is the person's voice changing over time?

Analytics should inform suggestions, not mechanically optimize every post toward the largest number. The person can choose whether a post is meant to teach, start a conversation, document work, or reach a broad audience.

## Trust and control

- Nothing is published without explicit user approval.
- Sources remain visible and attributable throughout drafting.
- Private synced analytics and voice references are not shared with challenge organizers merely because the person joined a challenge.
- The person can exclude individual posts from voice analysis and remove captured sources or drafts.
- Generated claims should be traceable to a source or clearly identified as the writer's opinion.

## First version

The first version should focus on:

- importing the user's X favorites through the extension;
- capturing pasted text and public URLs;
- turning captured material into a clean brief;
- selecting a few synced LinkedIn posts as visible voice guidance;
- generating a few distinct draft approaches for each saved idea;
- saving drafts in the five planning states;
- scheduling six reviewed posts for the upcoming week; and
- manually linking a published LinkedIn post back to its draft.

## Not yet

- automatic publishing or engagement;
- autonomous web research without a user-selected starting point;
- team approval workflows;
- publishing directly to X;
- bypassing platform restrictions to download media;
- a full multi-network social-media scheduler;
- scraping private content from third-party services; or
- generating posts solely to game challenge scoring.
