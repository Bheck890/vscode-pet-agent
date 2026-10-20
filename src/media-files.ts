/**
 * `media/webview.html` names every file the webview loads as
 * `<!--MEDIA:pets.js-->`, in load order. It is the one list of the webview's
 * scripts: the extension, the README recorder and the tests all read it.
 */
export const MEDIA_PLACEHOLDER = /<!--MEDIA:([\w.-]+)-->/g;

/** The media files a template loads, in order. */
export function mediaFiles(template: string): string[] {
  return [...template.matchAll(MEDIA_PLACEHOLDER)].map((m) => m[1]);
}
