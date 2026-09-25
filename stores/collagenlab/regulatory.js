// Single source of truth for the authorised EU vitamin C / collagen health
// claim wording (EU Regulation (EC) No 1924/2006 / (EU) No 432/2012). Do NOT
// duplicate this string elsewhere — import it. Getting a word in this claim
// wrong (e.g. "synthesis" vs "formation") is a real compliance issue, and it
// has already caused false-positive compliance flags once from drift between
// copies.
export const APPROVED_VITAMIN_C_CLAIM_BG =
  'Витамин С допринася за нормалното образуване на колаген за нормалната функция на кожата, костите и хрущялите.';

export const APPROVED_VITAMIN_C_CLAIM_EN =
  'Vitamin C contributes to normal collagen formation for the normal function of skin, bones and cartilage.';
