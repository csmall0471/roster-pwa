import { normalize, jaroWinkler } from "./similarity";

export type ClusterInput = { id: number; value: string };

export type Cluster = {
  // The canonical display label (the most frequent original spelling).
  canonical: string;
  // Distinct original spellings that landed in this cluster.
  variants: string[];
  // Source row ids (e.g. player indices) contributing to this cluster.
  ids: number[];
  // "high" = identical/near-identical spellings only; "review" = at least one
  // spelling was merged on a borderline score and should be confirmed by a
  // human (or the Claude pass) before it's trusted.
  confidence: "high" | "review";
};

// Above this similarity a merge is treated as obviously the same spelling;
// merges between `threshold` and this band are flagged for review.
const HIGH_BAND = 0.95;

// Greedy single-link clustering of free-text labels by normalized
// Jaro-Winkler similarity. Higher-frequency spellings seed clusters first so
// the canonical label is the common one (e.g. "Merkle" over "Merkel").
//
// `blockMerge(a, b)` (optional) vetoes a join even when the score clears the
// threshold — used to stop two different people who share a first name but have
// clearly different surnames from collapsing into one coach ("Cody Ahern" vs
// "Cody Lenhart"). Both args are already normalized.
export function clusterStrings(
  inputs: ClusterInput[],
  threshold = 0.9,
  blockMerge?: (a: string, b: string) => boolean
): Cluster[] {
  // Count frequency per normalized form, tracking original spellings.
  const freq = new Map<string, number>();
  for (const { value } of inputs) {
    const n = normalize(value);
    if (!n) continue;
    freq.set(n, (freq.get(n) ?? 0) + 1);
  }

  // Order distinct normalized forms by descending frequency for stable seeding.
  const ordered = [...new Set(inputs.map((i) => normalize(i.value)).filter(Boolean))].sort(
    (a, b) => (freq.get(b)! - freq.get(a)!) || a.localeCompare(b)
  );

  type Bucket = { rep: string; forms: Set<string>; minJoinScore: number };
  const buckets: Bucket[] = [];
  for (const form of ordered) {
    let best: Bucket | null = null;
    let bestScore = threshold;
    for (const bucket of buckets) {
      const score = jaroWinkler(form, bucket.rep);
      if (score >= bestScore && !blockMerge?.(form, bucket.rep)) {
        best = bucket;
        bestScore = score;
      }
    }
    if (best) {
      best.forms.add(form);
      best.minJoinScore = Math.min(best.minJoinScore, bestScore);
    } else {
      buckets.push({ rep: form, forms: new Set([form]), minJoinScore: 1 });
    }
  }

  // Assign each input to the bucket whose representative it best matches.
  const formToBucket = new Map<string, number>();
  buckets.forEach((b, bi) => b.forms.forEach((f) => formToBucket.set(f, bi)));

  const clusters: Cluster[] = buckets.map((b) => ({
    canonical: "",
    variants: [],
    ids: [],
    confidence: b.minJoinScore < HIGH_BAND ? "review" : "high",
  }));
  const variantCounts = buckets.map(() => new Map<string, number>());

  for (const { id, value } of inputs) {
    const n = normalize(value);
    if (!n) continue;
    const bi = formToBucket.get(n);
    if (bi == null) continue;
    clusters[bi].ids.push(id);
    const vc = variantCounts[bi];
    vc.set(value, (vc.get(value) ?? 0) + 1);
  }

  buckets.forEach((_, bi) => {
    const vc = variantCounts[bi];
    const variants = [...vc.entries()].sort((a, b) => b[1] - a[1]);
    clusters[bi].canonical = variants[0]?.[0] ?? "";
    clusters[bi].variants = variants.map((v) => v[0]);
  });

  return clusters.filter((c) => c.ids.length > 0).sort((a, b) => b.ids.length - a.ids.length);
}
