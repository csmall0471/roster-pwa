// Where a bulk-uploaded photo lives in the player-photos bucket. Shared so the
// uploader and the server action that builds the draft agree on the path.
export function photoDraftPath(userId: string, draftId: string): string {
  return `${userId}/cardgen-src/${draftId}.jpg`;
}
