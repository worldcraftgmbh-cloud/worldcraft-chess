/**
 * Photorealistic Luxury Wood Chess Board Canvas Renderer
 * Exact replication of the dark ebony/wenge frame, dashed marquetry inlay,
 * wavy tiger maple light squares, deep smoked ebony dark squares,
 * crisp vector Staunton pieces, smooth drag & drop, and HiDPI Retina support.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BoardRenderer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Classic Master Staunton SVG Vector Definitions (100% self-contained, glitch-free, high-DPI crisp)
  const PIECE_SVGS = {
    // White pieces (Warm Ivory / Maple Luster with Bronze Outline)
    'wp': `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="wPawnGrad" cx="35%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="50%" stop-color="#EFE7D5"/>
          <stop offset="100%" stop-color="#CFBF9F"/>
        </radialGradient>
      </defs>
      <path d="M 22 9 C 19.79 9 18 10.79 18 13 C 18 13.89 18.29 14.71 18.78 15.38 C 16.83 16.5 15.5 18.59 15.5 21 C 15.5 23.03 16.44 24.84 17.91 26.03 C 14.91 27.09 10.5 31.58 10.5 39.5 L 34.5 39.5 C 34.5 31.58 30.09 27.09 27.09 26.03 C 28.56 24.84 29.5 23.03 29.5 21 C 29.5 18.59 28.17 16.5 26.22 15.38 C 26.71 14.71 27 13.89 27 13 C 27 10.79 25.21 9 23 9 L 22 9 z"
            fill="url(#wPawnGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="22.5" cy="12" rx="3" ry="2" fill="#FFFFFF" opacity="0.6"/>
    </svg>`,

    'wn': `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="wKnightGrad" cx="30%" cy="25%" r="75%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="50%" stop-color="#EFE7D5"/>
          <stop offset="100%" stop-color="#CFBF9F"/>
        </radialGradient>
      </defs>
      <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18"
            fill="url(#wKnightGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,7.4 17.07,8.07 18,9 C 18.84,9.84 19.46,10.95 20,12 C 21.08,11.23 23.18,10.43 24,11 C 25,11.75 24.67,14.75 23,15 C 22,15.17 21.33,14.67 20,15 C 21.17,16.67 22.17,17.67 24,18 z"
            fill="url(#wKnightGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="9.5" cy="25.5" r="0.75" fill="#382C1E"/>
      <ellipse cx="14.5" cy="15.5" rx="1.2" ry="0.6" transform="rotate(-30 14.5 15.5)" fill="#382C1E"/>
    </svg>`,

    'wb': `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="wBishopGrad" cx="35%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="50%" stop-color="#EFE7D5"/>
          <stop offset="100%" stop-color="#CFBF9F"/>
        </radialGradient>
      </defs>
      <circle cx="22.5" cy="8" r="1.6" fill="url(#wBishopGrad)" stroke="#382C1E" stroke-width="1.3"/>
      <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.54 9,36 9,36 z"
            fill="url(#wBishopGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z"
            fill="url(#wBishopGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Diagonal notch (Kerbe) -->
      <path d="M 20.5,15.5 L 24.5,19.5" stroke="#382C1E" stroke-width="1.4" stroke-linecap="round"/>
      <!-- Horizontal body ridges -->
      <path d="M 17.5,26 L 27.5,26" stroke="#382C1E" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M 15,30 L 30,30" stroke="#382C1E" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,

    'wr': `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="wRookGrad" cx="35%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="50%" stop-color="#EFE7D5"/>
          <stop offset="100%" stop-color="#CFBF9F"/>
        </radialGradient>
      </defs>
      <path d="M 9,39 L 36,39 L 36,36 L 9,36 z"
            fill="url(#wRookGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 12,36 L 12,32 L 33,32 L 33,36 z"
            fill="url(#wRookGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 13,17 L 14,32 L 31,32 L 32,17 z"
            fill="url(#wRookGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 z"
            fill="url(#wRookGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 34,14 L 31,17 L 14,17 L 11,14"
            fill="url(#wRookGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="14" y1="28" x2="31" y2="28" stroke="#382C1E" stroke-width="1"/>
    </svg>`,

    'wq': `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="wQueenGrad" cx="35%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="50%" stop-color="#EFE7D5"/>
          <stop offset="100%" stop-color="#CFBF9F"/>
        </radialGradient>
      </defs>
      <circle cx="6" cy="12" r="1.8" fill="url(#wQueenGrad)" stroke="#382C1E" stroke-width="1.2"/>
      <circle cx="14" cy="9" r="1.8" fill="url(#wQueenGrad)" stroke="#382C1E" stroke-width="1.2"/>
      <circle cx="22.5" cy="8" r="2.2" fill="url(#wQueenGrad)" stroke="#382C1E" stroke-width="1.2"/>
      <circle cx="31" cy="9" r="1.8" fill="url(#wQueenGrad)" stroke="#382C1E" stroke-width="1.2"/>
      <circle cx="39" cy="12" r="1.8" fill="url(#wQueenGrad)" stroke="#382C1E" stroke-width="1.2"/>
      <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38,14 L 31,25 L 31,11 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14,11 L 14,25 L 7,14 L 9,26 z"
            fill="url(#wQueenGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 10.5,36 10.5,36 C 9,37.5 11,38.5 11,38.5 L 34,38.5 C 34,38.5 36,37.5 34.5,36 C 34.5,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 z"
            fill="url(#wQueenGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 11.5,30 C 15,29 30,29 33.5,30" stroke="#382C1E" stroke-width="1"/>
      <path d="M 12,33.5 C 18,32.5 27,32.5 33,33.5" stroke="#382C1E" stroke-width="1"/>
    </svg>`,

    'wk': `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="wKingGrad" cx="35%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="50%" stop-color="#EFE7D5"/>
          <stop offset="100%" stop-color="#CFBF9F"/>
        </radialGradient>
      </defs>
      <!-- Latin Cross on Crown -->
      <path d="M 22.5,11.5 L 22.5,4.5 M 19.5,7.5 L 25.5,7.5" stroke="#382C1E" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 24,11.5 21,11.5 22.5,11.5 C 24,11.5 21,11.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25 z"
            fill="url(#wKingGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 C 36.5,35 34.5,33 34.5,33 C 33.5,30.5 32,29.5 30.5,29.5 C 29,29.5 27.5,30 26.5,30.5 C 24.5,28 20.5,28 18.5,30.5 C 17.5,30 16,29.5 14.5,29.5 C 13,29.5 11.5,30.5 10.5,33 C 10.5,33 8.5,35 11.5,37 z"
            fill="url(#wKingGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 11.5,30 C 15,29 30,29 33.5,30" stroke="#382C1E" stroke-width="1"/>
      <path d="M 9,39 L 36,39 L 36,36 L 9,36 z"
            fill="url(#wKingGrad)" stroke="#382C1E" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,

    // Black pieces (Deep Obsidian / Smoked Ebony with Ivory/Gold Details)
    'bp': `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bPawnGrad" cx="30%" cy="25%" r="75%">
          <stop offset="0%" stop-color="#3D342E"/>
          <stop offset="50%" stop-color="#221C18"/>
          <stop offset="100%" stop-color="#0E0B09"/>
        </radialGradient>
      </defs>
      <path d="M 22 9 C 19.79 9 18 10.79 18 13 C 18 13.89 18.29 14.71 18.78 15.38 C 16.83 16.5 15.5 18.59 15.5 21 C 15.5 23.03 16.44 24.84 17.91 26.03 C 14.91 27.09 10.5 31.58 10.5 39.5 L 34.5 39.5 C 34.5 31.58 30.09 27.09 27.09 26.03 C 28.56 24.84 29.5 23.03 29.5 21 C 29.5 18.59 28.17 16.5 26.22 15.38 C 26.71 14.71 27 13.89 27 13 C 27 10.79 25.21 9 23 9 L 22 9 z"
            fill="url(#bPawnGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="22.5" cy="12" rx="3" ry="2" fill="#FFFFFF" opacity="0.15"/>
    </svg>`,

    'bn': `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bKnightGrad" cx="30%" cy="25%" r="75%">
          <stop offset="0%" stop-color="#3D342E"/>
          <stop offset="50%" stop-color="#221C18"/>
          <stop offset="100%" stop-color="#0E0B09"/>
        </radialGradient>
      </defs>
      <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18"
            fill="url(#bKnightGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,7.4 17.07,8.07 18,9 C 18.84,9.84 19.46,10.95 20,12 C 21.08,11.23 23.18,10.43 24,11 C 25,11.75 24.67,14.75 23,15 C 22,15.17 21.33,14.67 20,15 C 21.17,16.67 22.17,17.67 24,18 z"
            fill="url(#bKnightGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Eye and nostril highlights in warm ivory -->
      <circle cx="9.5" cy="25.5" r="0.75" fill="#D7CBB0"/>
      <ellipse cx="14.5" cy="15.5" rx="1.2" ry="0.6" transform="rotate(-30 14.5 15.5)" fill="#D7CBB0"/>
      <!-- Subtle mane and jaw line -->
      <path d="M 24,18 C 21,21 17,25 14,27" stroke="#7A6F62" stroke-width="1" fill="none" stroke-linecap="round"/>
    </svg>`,

    'bb': `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bBishopGrad" cx="30%" cy="25%" r="75%">
          <stop offset="0%" stop-color="#3D342E"/>
          <stop offset="50%" stop-color="#221C18"/>
          <stop offset="100%" stop-color="#0E0B09"/>
        </radialGradient>
      </defs>
      <circle cx="22.5" cy="8" r="1.6" fill="url(#bBishopGrad)" stroke="#000000" stroke-width="1.3"/>
      <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.54 9,36 9,36 z"
            fill="url(#bBishopGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z"
            fill="url(#bBishopGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Diagonal notch (Kerbe) in ivory -->
      <path d="M 20.5,15.5 L 24.5,19.5" stroke="#D7CBB0" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M 17.5,26 L 27.5,26" stroke="#7A6F62" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M 15,30 L 30,30" stroke="#7A6F62" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,

    'br': `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bRookGrad" cx="30%" cy="25%" r="75%">
          <stop offset="0%" stop-color="#3D342E"/>
          <stop offset="50%" stop-color="#221C18"/>
          <stop offset="100%" stop-color="#0E0B09"/>
        </radialGradient>
      </defs>
      <path d="M 9,39 L 36,39 L 36,36 L 9,36 z"
            fill="url(#bRookGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 12,36 L 12,32 L 33,32 L 33,36 z"
            fill="url(#bRookGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 13,17 L 14,32 L 31,32 L 32,17 z"
            fill="url(#bRookGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 z"
            fill="url(#bRookGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 34,14 L 31,17 L 14,17 L 11,14"
            fill="url(#bRookGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="14" y1="28" x2="31" y2="28" stroke="#7A6F62" stroke-width="1"/>
    </svg>`,

    'bq': `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bQueenGrad" cx="30%" cy="25%" r="75%">
          <stop offset="0%" stop-color="#3D342E"/>
          <stop offset="50%" stop-color="#221C18"/>
          <stop offset="100%" stop-color="#0E0B09"/>
        </radialGradient>
      </defs>
      <circle cx="6" cy="12" r="1.8" fill="url(#bQueenGrad)" stroke="#000000" stroke-width="1.2"/>
      <circle cx="14" cy="9" r="1.8" fill="url(#bQueenGrad)" stroke="#000000" stroke-width="1.2"/>
      <circle cx="22.5" cy="8" r="2.2" fill="url(#bQueenGrad)" stroke="#000000" stroke-width="1.2"/>
      <circle cx="31" cy="9" r="1.8" fill="url(#bQueenGrad)" stroke="#000000" stroke-width="1.2"/>
      <circle cx="39" cy="12" r="1.8" fill="url(#bQueenGrad)" stroke="#000000" stroke-width="1.2"/>
      <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38,14 L 31,25 L 31,11 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14,11 L 14,25 L 7,14 L 9,26 z"
            fill="url(#bQueenGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 10.5,36 10.5,36 C 9,37.5 11,38.5 11,38.5 L 34,38.5 C 34,38.5 36,37.5 34.5,36 C 34.5,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 z"
            fill="url(#bQueenGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 11.5,30 C 15,29 30,29 33.5,30" stroke="#7A6F62" stroke-width="1"/>
      <path d="M 12,33.5 C 18,32.5 27,32.5 33,33.5" stroke="#7A6F62" stroke-width="1"/>
    </svg>`,

    'bk': `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bKingGrad" cx="30%" cy="25%" r="75%">
          <stop offset="0%" stop-color="#3D342E"/>
          <stop offset="50%" stop-color="#221C18"/>
          <stop offset="100%" stop-color="#0E0B09"/>
        </radialGradient>
      </defs>
      <!-- Latin Cross in Ivory/Gold -->
      <path d="M 22.5,11.5 L 22.5,4.5 M 19.5,7.5 L 25.5,7.5" stroke="#D7CBB0" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 24,11.5 21,11.5 22.5,11.5 C 24,11.5 21,11.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25 z"
            fill="url(#bKingGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 C 36.5,35 34.5,33 34.5,33 C 33.5,30.5 32,29.5 30.5,29.5 C 29,29.5 27.5,30 26.5,30.5 C 24.5,28 20.5,28 18.5,30.5 C 17.5,30 16,29.5 14.5,29.5 C 13,29.5 11.5,30.5 10.5,33 C 10.5,33 8.5,35 11.5,37 z"
            fill="url(#bKingGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 11.5,30 C 15,29 30,29 33.5,30" stroke="#7A6F62" stroke-width="1"/>
      <path d="M 9,39 L 36,39 L 36,36 L 9,36 z"
            fill="url(#bKingGrad)" stroke="#000000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  };

  class BoardRenderer {
    constructor(canvas, game, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = game;

      this.options = {
        flipped: false, // false: White at bottom, true: Black at bottom
        showCoordinates: true,
        showMoveHints: true,
        showLastMove: true,
        ...options
      };

      // State for interaction
      this.isLocked = false;
      this.selectedSquare = null;
      this.validMoves = [];
      this.draggingPiece = null;
      this.dragPos = { x: 0, y: 0 };
      this.lastMove = null; // { from, to }

      // Piece Image Cache
      this.pieceImages = {};
      this.loadPieceImages();

      // Procedural textures cache for maximum 60fps rendering performance
      this.woodPatternCanvas = null;
      this.lightSquareCanvas = null;
      this.darkSquareCanvas = null;
      this.generateWoodPatterns();

      // Setup high DPI canvas scaling
      this.setupDpi();
      this.bindEvents();

      // Animation loop handle
      this.animId = null;
    }

    setupDpi() {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      const size = Math.min(rect.width || 800, rect.height || 800);

      this.logicalSize = size > 0 ? size : 800;
      this.canvas.width = this.logicalSize * dpr;
      this.canvas.height = this.logicalSize * dpr;
      this.canvas.style.width = `${this.logicalSize}px`;
      this.canvas.style.height = `${this.logicalSize}px`;

      this.ctx.resetTransform?.();
      this.ctx.scale(dpr, dpr);

      // Recalculate board dimensions
      this.computeMetrics();
    }

    computeMetrics() {
      // Board layout ratios:
      // Outer border frame: ~8.5%
      // Dashed inlay band: ~1.8%
      // 8x8 Playfield: remaining ~79.4%
      const total = this.logicalSize;
      this.frameWidth = Math.round(total * 0.082); // Outer dark wood border
      this.inlayBandWidth = Math.max(3, Math.round(total * 0.015)); // Marquetry dashed inlay
      this.inlayPadding = Math.round(total * 0.005); // Tiny gap between frame and inlay

      this.boardOriginX = this.frameWidth + this.inlayBandWidth + this.inlayPadding;
      this.boardOriginY = this.boardOriginX;
      this.boardPlaySize = total - this.boardOriginX * 2;
      this.squareSize = this.boardPlaySize / 8;
    }

    /**
     * Preloads SVG pieces into HTMLImageElements for instantaneous canvas blitting
     */
    loadPieceImages() {
      for (const [key, svgStr] of Object.entries(PIECE_SVGS)) {
        const img = new Image();
        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          this.pieceImages[key] = img;
          this.draw();
        };
        img.src = url;
      }
    }

    /**
     * Procedurally generates high-fidelity wood grain textures matching the reference image:
     * - Dark wenge/ebony with subtle porous lines and matte satin finish
     * - Tiger maple light squares with wavy fiddleback horizontal chatoyancy
     */
    generateWoodPatterns() {
      // 1. Dark Ebony/Wenge Pattern (Outer border & dark squares)
      const ebonyCanvas = document.createElement('canvas');
      ebonyCanvas.width = 256;
      ebonyCanvas.height = 256;
      const eCtx = ebonyCanvas.getContext('2d');

      // Base dark espresso tone
      eCtx.fillStyle = '#1D1715';
      eCtx.fillRect(0, 0, 256, 256);

      // Fine dark wood grain fibers
      for (let y = 0; y < 256; y++) {
        const noise = (Math.sin(y * 0.15) * 4) + (Math.sin(y * 0.8) * 2);
        const alpha = 0.03 + Math.abs(Math.sin(y * 0.5)) * 0.04;
        eCtx.fillStyle = y % 2 === 0 ? `rgba(45, 36, 33, ${alpha})` : `rgba(12, 9, 8, ${alpha})`;
        eCtx.fillRect(0, y, 256, 1);
      }
      this.darkWoodPattern = this.ctx.createPattern(ebonyCanvas, 'repeat');

      // 2. Light Creamy Tiger Maple Pattern (Light squares)
      const mapleCanvas = document.createElement('canvas');
      mapleCanvas.width = 256;
      mapleCanvas.height = 256;
      const mCtx = mapleCanvas.getContext('2d');

      // Base warm creamy blonde
      mCtx.fillStyle = '#EDE2CB';
      mCtx.fillRect(0, 0, 256, 256);

      // Wavy tiger maple ripples (fiddleback figure)
      for (let y = 0; y < 256; y++) {
        // Natural gentle wave equation
        const wave = Math.sin(y * 0.08) * Math.sin(y * 0.02) * 8;
        const toneVar = Math.sin((y + wave) * 0.25) * 0.5 + 0.5;
        const alpha = 0.04 + toneVar * 0.05;
        mCtx.fillStyle = `rgba(212, 192, 155, ${alpha})`;
        mCtx.fillRect(0, y, 256, 1);
      }
      this.lightWoodPattern = this.ctx.createPattern(mapleCanvas, 'repeat');
    }

    /**
     * Translates board square (0-63) to canvas pixel rect [x, y, size]
     */
    squareToCanvas(sq) {
      let file = sq % 8;
      let rank = Math.floor(sq / 8);

      if (this.options.flipped) {
        file = 7 - file;
        rank = 7 - rank;
      }

      const x = this.boardOriginX + file * this.squareSize;
      const y = this.boardOriginY + rank * this.squareSize;
      return { x, y, size: this.squareSize };
    }

    /**
     * Translates canvas pixel coordinate to board square (0-63) or -1 if outside
     */
    canvasToSquare(px, py) {
      if (
        px < this.boardOriginX ||
        px >= this.boardOriginX + this.boardPlaySize ||
        py < this.boardOriginY ||
        py >= this.boardOriginY + this.boardPlaySize
      ) {
        return -1;
      }

      let file = Math.floor((px - this.boardOriginX) / this.squareSize);
      let rank = Math.floor((py - this.boardOriginY) / this.squareSize);

      if (this.options.flipped) {
        file = 7 - file;
        rank = 7 - rank;
      }

      return rank * 8 + file;
    }

    /**
     * Main Render Loop
     */
    draw() {
      const ctx = this.ctx;
      const total = this.logicalSize;

      ctx.clearRect(0, 0, total, total);

      // 1. Draw outer luxury wood frame (matte ebony/wenge with rounded corners)
      this.drawOuterFrame(ctx, total);

      // 2. Draw the signature dashed marquetry inlay border
      this.drawDashedInlayBorder(ctx);

      // 3. Draw 8x8 checkerboard squares
      this.drawSquares(ctx);

      // 4. Draw highlights (Last move, Selected square, In Check alert)
      this.drawHighlights(ctx);

      // 5. Draw valid move target indicators
      if (this.options.showMoveHints) {
        this.drawMoveHints(ctx);
      }

      // 6. Draw Coordinates (A-H, 1-8)
      if (this.options.showCoordinates) {
        this.drawCoordinates(ctx);
      }

      // 7. Draw Pieces on board
      this.drawPieces(ctx);

      // 8. Draw dragging piece on top of everything
      if (this.draggingPiece) {
        this.drawDraggingPiece(ctx);
      }
    }

    /**
     * Draws the wide ebony frame with subtle rounded corners and bevel
     */
    drawOuterFrame(ctx, total) {
      const radius = 14;

      // Rounded frame path
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, total, total, radius);
      ctx.clip();

      // Deep dark wood base with procedural grain
      ctx.fillStyle = this.darkWoodPattern || '#1B1513';
      ctx.fillRect(0, 0, total, total);

      // Soft vignette / radial depth shading towards edges
      const grad = ctx.createRadialGradient(total / 2, total / 2, total * 0.35, total / 2, total / 2, total * 0.72);
      grad.addColorStop(0, 'rgba(38, 29, 26, 0.1)');
      grad.addColorStop(1, 'rgba(8, 6, 5, 0.65)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, total, total);

      // Bevel highlight top-left
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, total - 2, total - 2);

      // Subtle inner rim shadow before the inlay
      const innerX = this.boardOriginX - this.inlayBandWidth - this.inlayPadding;
      const innerW = total - innerX * 2;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#0F0C0A';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(innerX, innerX, innerW, innerW);

      ctx.restore();
    }

    /**
     * Draws the signature dashed marquetry inlay border around the 8x8 squares
     * (As seen in the user reference image: alternating light maple dashes on dark frame)
     */
    drawDashedInlayBorder(ctx) {
      const pad = this.inlayPadding;
      const x = this.boardOriginX - this.inlayBandWidth - pad;
      const y = x;
      const size = this.boardPlaySize + (this.inlayBandWidth + pad) * 2;
      const bandW = this.inlayBandWidth;

      ctx.save();

      // Dark inlay trench background
      ctx.fillStyle = '#120E0D';
      ctx.fillRect(x, y, size, size);

      // Draw light maple dashes
      // Reference image has approximately 30-36 dashes per side
      const numDashes = 32;
      const dashLength = (size - bandW * 2) / numDashes;
      const dashWidth = bandW;

      ctx.fillStyle = '#E8DCB8'; // Warm creamy maple inlay color

      // Top & Bottom rows
      for (let i = 0; i < numDashes; i += 2) {
        const dx = x + bandW + i * dashLength;
        // Top edge
        ctx.fillRect(dx, y, dashLength * 0.9, dashWidth);
        // Bottom edge
        ctx.fillRect(dx, y + size - dashWidth, dashLength * 0.9, dashWidth);
      }

      // Left & Right columns
      for (let i = 0; i < numDashes; i += 2) {
        const dy = y + bandW + i * dashLength;
        // Left edge
        ctx.fillRect(x, dy, dashWidth, dashLength * 0.9);
        // Right edge
        ctx.fillRect(x + size - dashWidth, dy, dashWidth, dashLength * 0.9);
      }

      // Solid corner squares to finish the marquetry frame
      ctx.fillRect(x, y, bandW, bandW);
      ctx.fillRect(x + size - bandW, y, bandW, bandW);
      ctx.fillRect(x, y + size - bandW, bandW, bandW);
      ctx.fillRect(x + size - bandW, y + size - bandW, bandW, bandW);

      // Thin inner divider line between inlay and 64 squares
      ctx.strokeStyle = '#0B0807';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.boardOriginX - 0.5, this.boardOriginY - 0.5, this.boardPlaySize + 1, this.boardPlaySize + 1);

      ctx.restore();
    }

    /**
     * Draws the 64 chess squares with wood grains and soft bevels
     */
    drawSquares(ctx) {
      const sqSize = this.squareSize;

      for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
          const isLight = (file + rank) % 2 === 0;
          const x = this.boardOriginX + file * sqSize;
          const y = this.boardOriginY + rank * sqSize;

          if (isLight) {
            // Light Square: Tiger maple with subtle warm grain
            ctx.fillStyle = this.lightWoodPattern || '#EADFC8';
            ctx.fillRect(x, y, sqSize, sqSize);

            // Subtle warm edge gradient
            const lGrad = ctx.createLinearGradient(x, y, x + sqSize, y + sqSize);
            lGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
            lGrad.addColorStop(1, 'rgba(195, 172, 135, 0.12)');
            ctx.fillStyle = lGrad;
            ctx.fillRect(x, y, sqSize, sqSize);
          } else {
            // Dark Square: Smoked ebony/wenge
            ctx.fillStyle = this.darkWoodPattern || '#221B18';
            ctx.fillRect(x, y, sqSize, sqSize);

            // Subtle depth gradient
            const dGrad = ctx.createLinearGradient(x, y, x + sqSize, y + sqSize);
            dGrad.addColorStop(0, 'rgba(40, 31, 28, 0.15)');
            dGrad.addColorStop(1, 'rgba(12, 9, 8, 0.25)');
            ctx.fillStyle = dGrad;
            ctx.fillRect(x, y, sqSize, sqSize);
          }
        }
      }
    }

    /**
     * Highlights for selected square, last move, and check alert
     */
    drawHighlights(ctx) {
      const sqSize = this.squareSize;

      // 1. Last Move Highlight (warm subtle golden tint)
      if (this.options.showLastMove && this.lastMove) {
        [this.lastMove.from, this.lastMove.to].forEach(sq => {
          if (sq !== null && sq >= 0) {
            const { x, y } = this.squareToCanvas(sq);
            ctx.fillStyle = 'rgba(218, 165, 32, 0.28)'; // Goldenrod tint
            ctx.fillRect(x, y, sqSize, sqSize);
          }
        });
      }

      // 2. Selected Square Highlight (refined glow ring + warm overlay)
      if (this.selectedSquare !== null && this.selectedSquare >= 0) {
        const { x, y } = this.squareToCanvas(this.selectedSquare);

        ctx.fillStyle = 'rgba(235, 185, 75, 0.35)';
        ctx.fillRect(x, y, sqSize, sqSize);

        ctx.strokeStyle = '#F7D070';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x + 1.25, y + 1.25, sqSize - 2.5, sqSize - 2.5);
      }

      // 3. King in Check Highlight (radiant crimson pulse)
      const currentTurn = this.game.turn;
      if (this.game.isInCheck(currentTurn)) {
        const kingSq = this.game.findKing(currentTurn);
        if (kingSq !== -1) {
          const { x, y } = this.squareToCanvas(kingSq);
          const radGrad = ctx.createRadialGradient(
            x + sqSize / 2, y + sqSize / 2, 5,
            x + sqSize / 2, y + sqSize / 2, sqSize * 0.75
          );
          radGrad.addColorStop(0, 'rgba(235, 45, 45, 0.85)');
          radGrad.addColorStop(0.6, 'rgba(200, 20, 20, 0.45)');
          radGrad.addColorStop(1, 'rgba(150, 0, 0, 0)');
          ctx.fillStyle = radGrad;
          ctx.fillRect(x, y, sqSize, sqSize);
        }
      }
    }

    /**
     * Draws target dots for valid moves
     */
    drawMoveHints(ctx) {
      const sqSize = this.squareSize;

      for (let i = 0; i < this.validMoves.length; i++) {
        const move = this.validMoves[i];
        const { x, y } = this.squareToCanvas(move.to);
        const cx = x + sqSize / 2;
        const cy = y + sqSize / 2;

        const isCapture = !!move.captured || move.isEnPassant;

        if (isCapture) {
          // Capture move: Elegant corner markers or target ring
          ctx.strokeStyle = 'rgba(220, 50, 50, 0.65)';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(cx, cy, sqSize * 0.42, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Quiet move: Soft, translucent centered dot
          ctx.fillStyle = 'rgba(120, 200, 90, 0.6)';
          ctx.beginPath();
          ctx.arc(cx, cy, sqSize * 0.15, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    /**
     * Draws board coordinates (A-H, 1-8) in the outer margin with refined typography
     */
    drawCoordinates(ctx) {
      const sqSize = this.squareSize;
      const fontSize = Math.max(10, Math.round(this.frameWidth * 0.28));

      ctx.save();
      ctx.font = `600 ${fontSize}px "Segoe UI", Roboto, system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(225, 210, 185, 0.55)'; // Subtle creamy gold
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

      if (this.options.flipped) {
        files.reverse();
        ranks.reverse();
      }

      // Horizontal files (A-H) along bottom and top margins
      const bottomY = this.boardOriginY + this.boardPlaySize + (this.logicalSize - (this.boardOriginY + this.boardPlaySize)) / 2;
      const topY = this.boardOriginY / 2;

      for (let i = 0; i < 8; i++) {
        const cx = this.boardOriginX + i * sqSize + sqSize / 2;
        ctx.fillText(files[i].toUpperCase(), cx, bottomY);
        ctx.fillText(files[i].toUpperCase(), cx, topY);
      }

      // Vertical ranks (1-8) along left and right margins
      const leftX = this.boardOriginX / 2;
      const rightX = this.boardOriginX + this.boardPlaySize + (this.logicalSize - (this.boardOriginX + this.boardPlaySize)) / 2;

      for (let i = 0; i < 8; i++) {
        const cy = this.boardOriginY + i * sqSize + sqSize / 2;
        ctx.fillText(ranks[i], leftX, cy);
        ctx.fillText(ranks[i], rightX, cy);
      }

      ctx.restore();
    }

    /**
     * Renders all pieces currently on the board
     */
    drawPieces(ctx) {
      const sqSize = this.squareSize;
      const padding = sqSize * 0.07;
      const pieceSize = sqSize - padding * 2;

      for (let sq = 0; sq < 64; sq++) {
        // Skip rendering piece if currently being dragged
        if (this.draggingPiece && this.draggingPiece.sq === sq) {
          continue;
        }

        const piece = this.game.board[sq];
        if (!piece) continue;

        const { x, y } = this.squareToCanvas(sq);
        const key = `${piece.color}${piece.type}`;
        const img = this.pieceImages[key];

        if (img && img.complete) {
          ctx.drawImage(img, x + padding, y + padding, pieceSize, pieceSize);
        }
      }
    }

    /**
     * Renders the piece currently being dragged by user cursor
     */
    drawDraggingPiece(ctx) {
      const sqSize = this.squareSize;
      const scale = 1.1; // Slightly larger for nice floating feel
      const size = sqSize * scale;
      const key = `${this.draggingPiece.piece.color}${this.draggingPiece.piece.type}`;
      const img = this.pieceImages[key];

      if (img && img.complete) {
        ctx.save();
        // Drop shadow for floating effect
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 10;

        ctx.drawImage(
          img,
          this.dragPos.x - size / 2,
          this.dragPos.y - size / 2,
          size,
          size
        );
        ctx.restore();
      }
    }

    /**
     * Event Handling for Drag-and-Drop and Click-to-Move
     */
    bindEvents() {
      const canvas = this.canvas;

      const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: clientX - rect.left,
          y: clientY - rect.top
        };
      };

      const handlePointerDown = (e) => {
        if (this.isLocked) return;
        const pos = getPos(e);
        const sq = this.canvasToSquare(pos.x, pos.y);
        if (sq === -1) return;

        const piece = this.game.board[sq];

        // 1. If clicking on an already selected square's valid target move
        if (this.selectedSquare !== null) {
          const move = this.validMoves.find(m => m.to === sq);
          if (move) {
            this.executeMove(move);
            this.clearSelection();
            this.draw();
            return;
          }
        }

        // 2. Select square / initiate drag
        if (piece && piece.color === this.game.turn) {
          this.selectedSquare = sq;
          this.validMoves = this.game.generateLegalMoves().filter(m => m.from === sq);
          this.draggingPiece = { sq, piece };
          this.dragPos = pos;
          this.draw();
        } else {
          this.clearSelection();
          this.draw();
        }
      };

      const handlePointerMove = (e) => {
        if (!this.draggingPiece) return;
        this.dragPos = getPos(e);
        this.draw();
      };

      const handlePointerUp = (e) => {
        if (!this.draggingPiece) return;

        const pos = this.dragPos;
        const destSq = this.canvasToSquare(pos.x, pos.y);
        const sourceSq = this.draggingPiece.sq;

        if (destSq !== -1 && destSq !== sourceSq) {
          const move = this.validMoves.find(m => m.to === destSq);
          if (move) {
            this.executeMove(move);
            this.clearSelection();
          } else {
            // Keep selection active for click-to-move
          }
        }

        this.draggingPiece = null;
        this.draw();
      };

      // Desktop events
      canvas.addEventListener('mousedown', handlePointerDown);
      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);

      // Touch events (Mobile / Tablet)
      canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handlePointerDown(e);
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (this.draggingPiece) {
          e.preventDefault();
          handlePointerMove(e);
        }
      }, { passive: false });

      window.addEventListener('touchend', (e) => {
        handlePointerUp(e);
      });

      // Window resize listener
      window.addEventListener('resize', () => {
        this.setupDpi();
        this.draw();
      });
    }

    clearSelection() {
      this.selectedSquare = null;
      this.validMoves = [];
      this.draggingPiece = null;
    }

    /**
     * Executes move through optional callback or directly
     */
    executeMove(move) {
      if (this.onMoveAttempt) {
        this.onMoveAttempt(move);
      } else {
        const res = this.game.makeMove(move);
        if (res) {
          this.lastMove = { from: res.from, to: res.to };
        }
      }
    }

    setLastMove(from, to) {
      this.lastMove = { from, to };
      this.draw();
    }

    flipBoard() {
      this.options.flipped = !this.options.flipped;
      this.draw();
    }
  }

  return BoardRenderer;
});
