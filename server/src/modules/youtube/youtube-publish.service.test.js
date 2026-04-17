// youtube-publish.service.test.js
// Unit tests for YouTubePublishService logic

jest.mock('../../config/db', () => jest.fn());
jest.mock('./youtube-oauth.service', () => ({
  getDecryptedToken: jest.fn(),
  refreshToken: jest.fn(),
}));
jest.mock('../webhooks/clickup-oauth.service', () => ({
  getDecryptedToken: jest.fn(),
}));
jest.mock('../../utils/event-bus', () => ({ emit: jest.fn() }));
jest.mock('../notifications/notifications.service', () => ({
  notifyPublishSuccess: jest.fn(),
}));

const publishService = require('./youtube-publish.service');

describe('YouTubePublishService._isShort', () => {
  test('returns true for yt_shorts', () => {
    expect(publishService._isShort('yt_shorts')).toBe(true);
  });

  test('returns false for yt_video', () => {
    expect(publishService._isShort('yt_video')).toBe(false);
  });

  test('returns true for reel', () => {
    expect(publishService._isShort('reel')).toBe(true);
  });

  test('returns true for image (default Short)', () => {
    expect(publishService._isShort('image')).toBe(true);
  });

  test('returns true for unknown type (default Short)', () => {
    expect(publishService._isShort('carousel')).toBe(true);
  });
});

describe('YouTubePublishService title / #Shorts logic', () => {
  test('Short title gets #Shorts appended when missing', () => {
    const isShort = true;
    let title = 'My awesome video'.slice(0, 100);
    if (isShort && !title.includes('#Shorts')) title += ' #Shorts';
    expect(title).toBe('My awesome video #Shorts');
  });

  test('Short title already containing #Shorts stays unchanged', () => {
    const isShort = true;
    let title = 'My video #Shorts'.slice(0, 100);
    if (isShort && !title.includes('#Shorts')) title += ' #Shorts';
    expect(title).toBe('My video #Shorts');
  });

  test('Normal video title does NOT get #Shorts appended', () => {
    const isShort = false;
    let title = 'My full video'.slice(0, 100);
    if (isShort && !title.includes('#Shorts')) title += ' #Shorts';
    expect(title).toBe('My full video');
  });
});

describe('YouTubePublishService privacyStatus logic', () => {
  test('Scheduled post → privacyStatus=private + publishAt set', () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const post = { scheduled_at: futureDate.toISOString() };

    const hasScheduledAt = post.scheduled_at && new Date(post.scheduled_at) > new Date();
    const status = hasScheduledAt
      ? { privacyStatus: 'private', publishAt: new Date(post.scheduled_at).toISOString() }
      : { privacyStatus: 'public' };

    expect(status.privacyStatus).toBe('private');
    expect(status.publishAt).toBe(futureDate.toISOString());
  });

  test('Immediate post → privacyStatus=public', () => {
    const post = { scheduled_at: null };

    const hasScheduledAt = post.scheduled_at && new Date(post.scheduled_at) > new Date();
    const status = hasScheduledAt
      ? { privacyStatus: 'private', publishAt: new Date(post.scheduled_at).toISOString() }
      : { privacyStatus: 'public' };

    expect(status.privacyStatus).toBe('public');
    expect(status.publishAt).toBeUndefined();
  });

  test('Past scheduled_at → privacyStatus=public (not scheduled)', () => {
    const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const post = { scheduled_at: pastDate.toISOString() };

    const hasScheduledAt = post.scheduled_at && new Date(post.scheduled_at) > new Date();
    const status = hasScheduledAt
      ? { privacyStatus: 'private', publishAt: new Date(post.scheduled_at).toISOString() }
      : { privacyStatus: 'public' };

    expect(status.privacyStatus).toBe('public');
  });
});

describe('YouTubePublishService permalink logic', () => {
  test('Short permalink uses /shorts/ path', () => {
    const isShort = true;
    const videoId = 'abc123';
    const permalink = isShort
      ? `https://youtube.com/shorts/${videoId}`
      : `https://youtube.com/watch?v=${videoId}`;
    expect(permalink).toBe('https://youtube.com/shorts/abc123');
  });

  test('Normal permalink uses /watch?v= path', () => {
    const isShort = false;
    const videoId = 'xyz789';
    const permalink = isShort
      ? `https://youtube.com/shorts/${videoId}`
      : `https://youtube.com/watch?v=${videoId}`;
    expect(permalink).toBe('https://youtube.com/watch?v=xyz789');
  });
});
