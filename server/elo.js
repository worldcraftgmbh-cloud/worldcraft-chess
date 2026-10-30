/**
 * FIDE-Compliant ELO Rating System & Tiered Regional Leaderboards
 * Supports tiers: International, National, and Regional/Bundesland.
 */

class EloSystem {
  constructor() {
    // In-memory player database with preloaded realistic regional ladder
    this.players = new Map();
    this.matchHistory = [];

    this.initDefaultPlayers();
  }

  /**
   * Calculates FIDE-standard K-factor based on player experience and rating
   */
  getKFactor(rating, gamesPlayed) {
    if (gamesPlayed < 30) return 40;
    if (rating >= 2400) return 10;
    return 20;
  }

  /**
   * Expected score probability: E = 1 / (1 + 10^((opp - player) / 400))
   */
  getExpectedScore(playerRating, opponentRating) {
    return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  }

  /**
   * Computes updated ratings after a match
   * scoreA: 1.0 (win A), 0.5 (draw), 0.0 (win B / loss A)
   */
  calculateMatch(playerA, playerB, scoreA) {
    const scoreB = 1.0 - scoreA;

    const expA = this.getExpectedScore(playerA.rating, playerB.rating);
    const expB = this.getExpectedScore(playerB.rating, playerA.rating);

    const kA = this.getKFactor(playerA.rating, playerA.gamesPlayed);
    const kB = this.getKFactor(playerB.rating, playerB.gamesPlayed);

    const deltaA = Math.round(kA * (scoreA - expA));
    const deltaB = Math.round(kB * (scoreB - expB));

    const newRatingA = Math.max(100, playerA.rating + deltaA);
    const newRatingB = Math.max(100, playerB.rating + deltaB);

    return {
      playerA: {
        oldRating: playerA.rating,
        newRating: newRatingA,
        delta: deltaA,
        score: scoreA
      },
      playerB: {
        oldRating: playerB.rating,
        newRating: newRatingB,
        delta: deltaB,
        score: scoreB
      }
    };
  }

  /**
   * Records match outcome and updates persistent player profiles
   */
  recordMatch(playerIdA, playerIdB, scoreA, pgn = '') {
    const pA = this.getPlayer(playerIdA);
    const pB = this.getPlayer(playerIdB);

    const result = this.calculateMatch(pA, pB, scoreA);

    pA.rating = result.playerA.newRating;
    pA.gamesPlayed++;
    if (scoreA === 1) pA.wins++;
    else if (scoreA === 0.5) pA.draws++;
    else pA.losses++;

    pB.rating = result.playerB.newRating;
    pB.gamesPlayed++;
    if (scoreA === 0) pB.wins++;
    else if (scoreA === 0.5) pB.draws++;
    else pB.losses++;

    const record = {
      id: `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      white: { id: pA.id, name: pA.name, rating: result.playerA.newRating, delta: result.playerA.delta },
      black: { id: pB.id, name: pB.name, rating: result.playerB.newRating, delta: result.playerB.delta },
      score: scoreA,
      pgn
    };

    this.matchHistory.unshift(record);
    if (this.matchHistory.length > 500) this.matchHistory.pop();

    return { result, record };
  }

  getPlayer(id) {
    const safeId = id || ('u_' + Math.random().toString(36).substring(2, 8));
    if (!this.players.has(safeId)) {
      this.players.set(safeId, {
        id: safeId,
        name: `Spieler_${safeId.substring(0, 5)}`,
        rating: 1500,
        country: 'Deutschland',
        region: 'Bayern',
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        title: null
      });
    }
    return this.players.get(id);
  }

  registerPlayer(data) {
    const id = data.id || `user_${Date.now()}`;
    const player = {
      id,
      name: data.name || 'Unbekannter Meister',
      rating: data.rating || 1500,
      country: data.country || 'Deutschland',
      region: data.region || 'Bayern',
      gamesPlayed: data.gamesPlayed || 0,
      wins: data.wins || 0,
      losses: data.losses || 0,
      draws: data.draws || 0,
      title: data.title || null
    };
    this.players.set(id, player);
    return player;
  }

  /**
   * Retrieves leaderboard filtered by scope: 'international', 'national', or specific region/bundesland
   */
  getLeaderboard(filter = {}) {
    let list = Array.from(this.players.values());

    if (filter.country && filter.country !== 'Alle') {
      list = list.filter(p => p.country.toLowerCase() === filter.country.toLowerCase());
    }

    if (filter.region && filter.region !== 'Alle') {
      list = list.filter(p => p.region.toLowerCase() === filter.region.toLowerCase());
    }

    // Sort descending by ELO rating
    list.sort((a, b) => b.rating - a.rating);

    return list.slice(0, filter.limit || 50).map((p, rank) => ({
      rank: rank + 1,
      ...p,
      winRate: p.gamesPlayed > 0 ? Math.round((p.wins / p.gamesPlayed) * 100) : 0
    }));
  }

  /**
   * Populates initial realistic tiered ladder
   */
  initDefaultPlayers() {
    const seeds = [
      { id: 'gm_carlsen', name: 'Magnus C.', rating: 2835, country: 'International', region: 'Norwegen', title: 'GM', gamesPlayed: 320, wins: 245, losses: 25, draws: 50 },
      { id: 'gm_keymer', name: 'Vincent Keymer', rating: 2738, country: 'Deutschland', region: 'Rheinland-Pfalz', title: 'GM', gamesPlayed: 180, wins: 120, losses: 22, draws: 38 },
      { id: 'gm_bluebaum', name: 'Matthias Blübaum', rating: 2665, country: 'Deutschland', region: 'Nordrhein-Westfalen', title: 'GM', gamesPlayed: 145, wins: 95, losses: 20, draws: 30 },
      { id: 'im_donchenko', name: 'Alexander D.', rating: 2642, country: 'Deutschland', region: 'Hessen', title: 'GM', gamesPlayed: 160, wins: 104, losses: 26, draws: 30 },
      { id: 'player_muc', name: 'Maximilian V. (München)', rating: 2180, country: 'Deutschland', region: 'Bayern', title: 'FM', gamesPlayed: 92, wins: 58, losses: 21, draws: 13 },
      { id: 'player_berlin', name: 'Sophie Weber (Berlin)', rating: 2045, country: 'Deutschland', region: 'Berlin', title: 'WFM', gamesPlayed: 84, wins: 49, losses: 24, draws: 11 },
      { id: 'player_stuttgart', name: 'Lukas S. (Stuttgart)', rating: 1950, country: 'Deutschland', region: 'Baden-Württemberg', title: null, gamesPlayed: 65, wins: 38, losses: 20, draws: 7 },
      { id: 'player_hamburg', name: 'Jan Hansen (Hamburg)', rating: 1870, country: 'Deutschland', region: 'Hamburg', title: null, gamesPlayed: 54, wins: 29, losses: 18, draws: 7 },
      { id: 'player_dresden', name: 'Clara Richter (Dresden)', rating: 1760, country: 'Deutschland', region: 'Sachsen', title: null, gamesPlayed: 48, wins: 26, losses: 16, draws: 6 },
      { id: 'player_guest', name: 'Gastspieler', rating: 1500, country: 'Deutschland', region: 'Bayern', title: null, gamesPlayed: 0, wins: 0, losses: 0, draws: 0 }
    ];

    seeds.forEach(s => this.registerPlayer(s));
  }
}

module.exports = EloSystem;
