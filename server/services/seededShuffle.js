/**
 * Shuffle déterministe (même algo que public/js/progress.js).
 */
function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < String(str).length; i += 1) {
        h ^= String(str).charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function seededShuffle(items, seedStr) {
    const copy = [...items];
    let seed = hashSeed(seedStr);
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

module.exports = { seededShuffle, hashSeed };
