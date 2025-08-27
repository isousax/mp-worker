export type LimitsMap = Record<string, number>;

/**
 * Enforce photo limits according to plan.
 * - clones the input (deep clone)
 * - traverses recursively looking for arrays that look like "photos"
 *   (items are objects with preview/url/src or strings that look like urls)
 * - trims those arrays to the limit for the given plan
 *
 * Returns the sanitized clone.
 */
export function enforceFormDataLimits(
  formData: Record<string, any>,
  plan: string | undefined,
  limits: LimitsMap = { basic: 4, standard: 6, premium: 10 }
): Record<string, any> {
  const planKey = String(plan || "").toLowerCase();
  const limit = limits[planKey];

  // If no limit configured for the plan, return original (deep-cloned to be safe)
  const cloned = deepClone(formData);
  if (typeof limit !== "number" || limit <= 0) {
    return cloned;
  }

  let trimmedOccurrences: Array<{
    path: string;
    original: number;
    kept: number;
  }> = [];

  function isUrlString(s: any) {
    return typeof s === "string" && /^https?:\/\//i.test(s);
  }

  function looksLikePhotoArray(arr: any[]): boolean {
    if (arr.length === 0) return false;
    const first = arr[0];
    if (typeof first === "string") {
      return isUrlString(first);
    }
    if (first && typeof first === "object") {
      return (
        "preview" in first ||
        "url" in first ||
        "src" in first ||
        "photo" in first ||
        "filename" in first
      );
    }
    return false;
  }

  function traverse(obj: any, path = ""): void {
    if (Array.isArray(obj)) {
      if (looksLikePhotoArray(obj) && obj.length > limit) {
        trimmedOccurrences.push({
          path: path || "/",
          original: obj.length,
          kept: limit,
        });
        obj.splice(limit); // trim in-place on the clone
      } else {
        // traverse array items
        obj.forEach((item, idx) => traverse(item, `${path}[${idx}]`));
      }
    } else if (obj && typeof obj === "object") {
      Object.keys(obj).forEach((k) =>
        traverse(obj[k], path ? `${path}.${k}` : k)
      );
    }
    // primitives ignored
  }

  traverse(cloned, "");

  if (trimmedOccurrences.length > 0) {
    // Log for debugging / auditing
    console.info(
      `[enforceFormDataLimits] plan="${planKey}" applied. trimmed arrays:`,
      trimmedOccurrences
    );
  } else {
    console.debug(
      `[enforceFormDataLimits] plan="${planKey}" no trimming needed.`
    );
  }

  return cloned;
}

function deepClone<T>(v: T): T {
  // safe clone for JSON-serializable payloads (which form_data normally is)
  return JSON.parse(JSON.stringify(v));
}
