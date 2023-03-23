import {IdFn, WasTouchedFn} from './HTypes';

const defaultIdFn = <T>(val: T): T => val;
export const defaultWasTouchedFn = (_: any) => false;

/**
 * Least common sequence result. buffer1[buffer1index] will be equal to
 * buffer2[buffer2index], and chain points to the next character in the least common
 * sequence, if it exists.
 */
export interface LcsResult {
  buffer1index: number;
  buffer2index: number;
  wasTouched: boolean;
  chain: null | LcsResult;
}

interface LcsProps<T> {
  wasTouchedFn: WasTouchedFn<T>;
  idFn: IdFn<T>;
}

// Text diff algorithm following Hunt and McIlroy 1976.
// J. W. Hunt and M. D. McIlroy, An algorithm for differential buffer
// comparison, Bell Telephone Laboratories CSTR #41 (1976)
// http://www.cs.dartmouth.edu/~doug/
// https://en.wikipedia.org/wiki/Longest_common_subsequence_problem
//
// Expects two arrays, finds longest common sequence
export function longestCommonSequence<T>(
  buffer1: T[],
  buffer2: T[],
  inpProps: Partial<LcsProps<T>> = {}
): LcsResult {
  const props: LcsProps<T> = Object.assign(
    {
      wasTouchedFn: defaultWasTouchedFn,
      idFn: defaultIdFn
    },
    inpProps
  );

  interface EquivalenceClassElement {
    indexes: number[];
    wasTouched: boolean;
  }

  const equivalenceClasses = new Map<T | string, EquivalenceClassElement>();
  for (let j = 0; j < buffer2.length; j++) {
    const item = buffer2[j];
    const itemId = props.idFn(item);
    const itemClass: EquivalenceClassElement = equivalenceClasses.get(
      itemId
    ) || {
      indexes: [],
      wasTouched: props.wasTouchedFn(item)
    };
    const equivalenceClass = itemClass.indexes;
    equivalenceClass.push(j);
    equivalenceClasses.set(itemId, itemClass);
  }

  const NULLRESULT: LcsResult = {
    buffer1index: -1,
    buffer2index: -1,
    wasTouched: false,
    chain: null
  };
  const candidates = [NULLRESULT];

  for (let i = 0; i < buffer1.length; i++) {
    const item = buffer1[i];
    const itemId = props.idFn(item);
    const itemClass: EquivalenceClassElement = equivalenceClasses.get(
      itemId
    ) || {
      indexes: [],
      wasTouched: false
    };
    const buffer2indices = itemClass.indexes;
    let r = 0;
    let c = candidates[0];

    for (let jx = 0; jx < buffer2indices.length; jx++) {
      const j = buffer2indices[jx];

      let s: number;
      for (s = r; s < candidates.length; s++) {
        if (
          candidates[s].buffer2index < j &&
          (s === candidates.length - 1 || candidates[s + 1].buffer2index > j)
        ) {
          break;
        }
      }

      if (s < candidates.length) {
        const newCandidate = {
          buffer1index: i,
          buffer2index: j,
          wasTouched: itemClass.wasTouched,
          chain: candidates[s]
        };
        if (r === candidates.length) {
          candidates.push(c);
        } else {
          candidates[r] = c;
        }
        r = s + 1;
        c = newCandidate;
        if (r === candidates.length) {
          break; // no point in examining further (j)s
        }
      }
    }

    candidates[r] = c;
  }

  // At this point, we know the LCS: it's in the reverse of the
  // linked-list through .chain of candidates[candidates.length - 1].

  return candidates[candidates.length - 1];
}

interface DiffIndicesElement<T> {
  buffer1: number[];
  buffer1Content: T[];
  buffer2: number[];
  buffer2Content: T[];
}

interface Diff3Options<T = any> {
  wasTouchedFn: (val: T, side: 'left' | 'right') => boolean;
}

// We apply the LCS to give a simple representation of the
// offsets and lengths of mismatched chunks in the input
// buffers. This is used by diff3MergeRegions.
function diffIndices<T>(
  buffer1: T[],
  buffer2: T[],
  inpProps?: Partial<LcsProps<T>>
): DiffIndicesElement<T>[] {
  const lcs = longestCommonSequence(buffer1, buffer2, inpProps);
  const result: DiffIndicesElement<T>[] = [];
  let tail1 = buffer1.length;
  let tail2 = buffer2.length;

  for (
    let candidate: null | LcsResult = lcs;
    candidate !== null;
    candidate = candidate.chain
  ) {
    const mismatchLength1 = tail1 - candidate.buffer1index - 1;
    const mismatchLength2 = tail2 - candidate.buffer2index - 1;
    tail1 = candidate.buffer1index;
    tail2 = candidate.buffer2index;

    if (mismatchLength1 || mismatchLength2) {
      result.push({
        buffer1: [tail1 + 1, mismatchLength1],
        buffer1Content: buffer1.slice(tail1 + 1, tail1 + 1 + mismatchLength1),
        buffer2: [tail2 + 1, mismatchLength2],
        buffer2Content: buffer2.slice(tail2 + 1, tail2 + 1 + mismatchLength2)
      });
    }
    if (candidate.wasTouched) {
      result.push({
        buffer1: [candidate.buffer1index, 1],
        buffer2: [candidate.buffer2index, 1],
        buffer1Content: [buffer1[candidate.buffer1index]],
        buffer2Content: [buffer2[candidate.buffer2index]]
      });
    }
  }

  result.reverse();
  return result;
}

interface Hunk {
  ab: 'a' | 'b';
  oStart: number;
  oLength: number;
  abStart: number;
  abLength: number;
}

export interface StableRegion<T> {
  stable: true;
  buffer: 'a' | 'o' | 'b';
  bufferStart: number;
  bufferLength: number;
  bufferContent: T[];
}

export interface UnstableRegion<T> {
  stable: false;
  aStart: number;
  aLength: number;
  aContent: T[];
  bStart: number;
  bLength: number;
  bContent: T[];
  oStart: number;
  oLength: number;
  oContent: T[];
}

export type DiffMergeRegion<T> = StableRegion<T> | UnstableRegion<T>;
// Given three buffers, A, O, and B, where both A and B are
// independently derived from O, returns a fairly complicated
// internal representation of merge decisions it's taken. The
// interested reader may wish to consult
//
// Sanjeev Khanna, Keshav Kunal, and Benjamin C. Pierce.
// 'A Formal Investigation of ' In Arvind and Prasad,
// editors, Foundations of Software Technology and Theoretical
// Computer Science (FSTTCS), December 2007.
//
// (http://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf)
//
export function diff3MergeRegions<T>(
  a: T[],
  o: T[],
  b: T[],
  inpProps: Partial<Diff3Options> = {}
): DiffMergeRegion<T>[] {
  const props: Diff3Options = Object.assign(
    {wasTouchedFn: defaultWasTouchedFn},
    inpProps
  );
  const wasATouched = (val: T) => props.wasTouchedFn(val, 'left');
  const wasBTouched = (val: T) => props.wasTouchedFn(val, 'right');
  // "hunks" are array subsets where `a` or `b` are different from `o`
  // https://www.gnu.org/software/diffutils/manual/html_node/diff3-Hunks.html
  const hunks: Hunk[] = [];

  function addHunk(h: DiffIndicesElement<T>, ab: 'a' | 'b') {
    hunks.push({
      ab: ab,
      oStart: h.buffer1[0],
      oLength: h.buffer1[1], // length of o to remove
      abStart: h.buffer2[0],
      abLength: h.buffer2[1] // length of a/b to insert
      // abContent: (ab === 'a' ? a : b).slice(h.buffer2[0], h.buffer2[0] + h.buffer2[1])
    });
  }

  diffIndices(o, a, {wasTouchedFn: wasATouched}).forEach(item =>
    addHunk(item, 'a')
  );
  diffIndices(o, b, {wasTouchedFn: wasBTouched}).forEach(item =>
    addHunk(item, 'b')
  );
  hunks.sort((x, y) => x.oStart - y.oStart);

  const results: DiffMergeRegion<T>[] = [];
  let currOffset = 0;

  function advanceTo(endOffset: number) {
    if (endOffset > currOffset) {
      results.push({
        stable: true,
        buffer: 'o',
        bufferStart: currOffset,
        bufferLength: endOffset - currOffset,
        bufferContent: o.slice(currOffset, endOffset)
      });
      currOffset = endOffset;
    }
  }

  while (hunks.length) {
    let hunk = hunks.shift()!;
    const regionStart = hunk.oStart;
    let regionEnd = hunk.oStart + hunk.oLength;
    const regionHunks = [hunk];
    advanceTo(regionStart);

    // Try to pull next overlapping hunk into this region
    while (hunks.length) {
      const nextHunk = hunks[0];
      const nextHunkStart = nextHunk.oStart;
      if (nextHunkStart > regionEnd) break; // no overlap

      regionEnd = Math.max(regionEnd, nextHunkStart + nextHunk.oLength);
      regionHunks.push(hunks.shift()!);
    }

    if (regionHunks.length === 1) {
      // Only one hunk touches this region, meaning that there is no conflict here.
      // Either `a` or `b` is inserting into a region of `o` unchanged by the other.
      if (hunk.abLength > 0) {
        const buffer = hunk.ab === 'a' ? a : b;
        results.push({
          stable: true,
          buffer: hunk.ab,
          bufferStart: hunk.abStart,
          bufferLength: hunk.abLength,
          bufferContent: buffer.slice(
            hunk.abStart,
            hunk.abStart + hunk.abLength
          )
        });
      }
    } else {
      // A true a/b conflict. Determine the bounds involved from `a`, `o`, and `b`.
      // Effectively merge all the `a` hunks into one giant hunk, then do the
      // same for the `b` hunks; then, correct for skew in the regions of `o`
      // that each side changed, and report appropriate spans for the three sides.
      const bounds = {
        a: [a.length, -1, o.length, -1],
        b: [b.length, -1, o.length, -1]
      };
      while (regionHunks.length) {
        hunk = regionHunks.shift()!;
        const oStart = hunk.oStart;
        const oEnd = oStart + hunk.oLength;
        const abStart = hunk.abStart;
        const abEnd = abStart + hunk.abLength;
        const b = bounds[hunk.ab];
        b[0] = Math.min(abStart, b[0]);
        b[1] = Math.max(abEnd, b[1]);
        b[2] = Math.min(oStart, b[2]);
        b[3] = Math.max(oEnd, b[3]);
      }

      const aStart = bounds.a[0] + (regionStart - bounds.a[2]);
      const aEnd = bounds.a[1] + (regionEnd - bounds.a[3]);
      const bStart = bounds.b[0] + (regionStart - bounds.b[2]);
      const bEnd = bounds.b[1] + (regionEnd - bounds.b[3]);

      const result: DiffMergeRegion<T> = {
        stable: false,
        aStart: aStart,
        aLength: aEnd - aStart,
        aContent: a.slice(aStart, aEnd),
        oStart: regionStart,
        oLength: regionEnd - regionStart,
        oContent: o.slice(regionStart, regionEnd),
        bStart: bStart,
        bLength: bEnd - bStart,
        bContent: b.slice(bStart, bEnd)
      };
      results.push(result);
    }
    currOffset = regionEnd;
  }

  advanceTo(o.length);

  return results;
}

export interface OkMergeRegion<T> {
  ok: T[];
}

type ArrayElement<T> = T extends Array<infer S> ? S : T;

export interface ConflictMergeRegion<T> {
  conflict: {
    a: T[];
    aIndex: number;
    b: T[];
    bIndex: number;
    o: T[];
    oIndex: number;
  };
}

export type MergeRegion<T> = OkMergeRegion<T> | ConflictMergeRegion<T>;

export interface Diff3MergeOptions<T = any> extends Diff3Options<T> {
  excludeFalseConflicts: boolean;
  stringSeparator: string | RegExp;
}

// Applies the output of diff3MergeRegions to actually
// construct the merged buffer; the returned result alternates
// between 'ok' and 'conflict' blocks.
// A "false conflict" is where `a` and `b` both change the same from `o`
export function diff3Merge<T extends string | Array<any>>(
  inpA: T,
  inpO: T,
  inpB: T,
  inpOptions: Partial<Diff3MergeOptions> = {}
): MergeRegion<ArrayElement<T>>[] {
  const options: Diff3MergeOptions = Object.assign(
    {
      excludeFalseConflicts: true,
      stringSeparator: /\s+/,
      wasTouchedFn: defaultWasTouchedFn
    },
    inpOptions
  );

  const a = (
    typeof inpA === 'string' ? inpA.split(options.stringSeparator) : inpA
  ) as ArrayElement<T>[];
  const o = (
    typeof inpO === 'string' ? inpO.split(options.stringSeparator) : inpO
  ) as ArrayElement<T>[];
  const b = (
    typeof inpB === 'string' ? inpB.split(options.stringSeparator) : inpB
  ) as ArrayElement<T>[];

  const results: MergeRegion<ArrayElement<T>>[] = [];
  const regions = diff3MergeRegions(a, o, b, options);

  let okBuffer: ArrayElement<T>[] = [];

  function flushOk() {
    if (okBuffer.length) {
      results.push({ok: okBuffer});
    }
    okBuffer = [];
  }

  function isFalseConflict(a: T[], b: T[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  for (const region of regions) {
    if (region.stable) {
      okBuffer.push(...region.bufferContent);
    } else {
      if (
        options.excludeFalseConflicts &&
        isFalseConflict(region.aContent, region.bContent)
      ) {
        okBuffer.push(...region.aContent);
      } else {
        flushOk();
        results.push({
          conflict: {
            a: region.aContent,
            aIndex: region.aStart,
            o: region.oContent,
            oIndex: region.oStart,
            b: region.bContent,
            bIndex: region.bStart
          }
        });
      }
    }
  }

  flushOk();
  return results;
}
