export const soundIds = Object.freeze({
  shotgun: 0, impact: 1, death: 2, gem: 3, level: 4, chest: 5, hurt: 6, boss: 7,
  evolve: 8, scythe: 9, flame: 10, lightning: 11, cards: 12, choose: 13, coin: 14,
  buy: 15, refuse: 16, victory: 17, defeat: 18, bolt: 19, trap: 20, hound: 21
});

const sine = 'sine', triangle = 'triangle', saw = 'sawtooth', square = 'square';
const noise = 'bandpass', rumble = 'lowpass', scratch = 'highpass';
const note = (shape, hz, end, duration, gain, delay = 0, attack = .008) =>
  ({ shape, hz, end, duration, gain, delay, attack });

export const effects = [
  [4, note(noise, 1550, 390, .16, .18), note(sine, 112, 42, .18, .31)],
  [4, note(rumble, 510, 270, .085, .13), note(sine, 112, 60, .09, .19)],
  [3, note(triangle, 192, 62, .22, .12, 0, .018), note(rumble, 690, 430, .12, .09)],
  [4, note(sine, 660, 792, .13, .17), note(triangle, 1047, 1047, .13, .055, .038)],
  [8, note(triangle, 440, 440, .20, .21), note(sine, 523, 523, .22, .21, .075), note(sine, 659, 659, .24, .21, .15), note(sine, 880, 880, .32, .19, .23)],
  [8, note(noise, 2400, 1500, .09, .13), note(triangle, 349, 349, .20, .17, .08), note(triangle, 523, 523, .23, .18, .16), note(sine, 698, 698, .29, .21, .23)],
  [7, note(sine, 105, 34, .23, .31), note(saw, 161, 72, .17, .10), note(rumble, 750, 230, .14, .14)],
  [9, note(rumble, 190, 93, .72, .23), note(saw, 76, 68, .68, .17, .045, .10), note(triangle, 113, 101, .76, .21, .07, .12)],
  [6, note(noise, 3600, 590, .18, .13), note(triangle, 650, 330, .21, .18), note(sine, 1090, 540, .25, .08)],
  [4, note(noise, 3200, 640, .17, .19, 0, .036), note(triangle, 249, 120, .088, .10, .034)],
  [3, note(noise, 1300, 420, .23, .15, 0, .026), note(scratch, 4600, 2800, .10, .08, .032)],
  [5, note(scratch, 3500, 950, .10, .21), note(rumble, 370, 110, .40, .20, .045), note(sine, 81, 34, .30, .19, .027)],
  [5, note(noise, 520, 3600, .14, .095, .02, .05)],
  [6, note(triangle, 570, 315, .07, .13), note(sine, 850, 850, .10, .11, .024)],
  [5, note(sine, 989, 1174, .16, .11), note(triangle, 1460, 1460, .11, .06, .033)],
  [6, note(sine, 587, 587, .17, .13), note(sine, 880, 880, .24, .15, .085)],
  [6, note(triangle, 275, 192, .15, .14), note(square, 174, 130, .09, .035, .05)],
  [9, note(triangle, 392, 392, .26, .19), note(triangle, 523, 523, .26, .19, .12), note(sine, 659, 659, .36, .18, .24), note(triangle, 784, 784, .48, .17, .36)],
  [9, note(triangle, 294, 247, .32, .18), note(triangle, 220, 196, .39, .16, .14), note(sine, 146, 110, .53, .17, .26)],
  [4, note(noise, 3200, 970, .081, .12), note(triangle, 335, 151, .12, .12)],
  [5, note(rumble, 760, 150, .28, .20), note(sine, 95, 43, .27, .30)],
  [4, note(saw, 210, 128, .15, .075), note(noise, 1120, 510, .18, .12)]
];

const swampArp = [0, null, 7, null, 3, null, 10, 7, null, 0, null, 7, 5, null, 3, null];
const floodArp = [0, 12, 7, 12, 3, 15, 7, 10, 0, 12, 7, 14, 5, 10, 3, 7];
const bossArp = [0, 12, 1, 7, 0, 12, 3, 10, 0, 12, 1, 13, 7, 6, 3, 7];

export const tracks = {
  menu: { bpm: 70, root: 38, chords: [0, -2, -4, -5], bass: [0], arp: [0, null, null, null, 7, null, 12, null, 3, null, null, null, 10, null, 7, null], gain: .76 },
  quiet: { bpm: 88, root: 38, chords: [0, -2, -4, -5], bass: [0, 8], arp: swampArp, gain: .83 },
  active: { bpm: 99, root: 38, chords: [0, -2, -4, -5], bass: [0, 6, 8], arp: swampArp, drums: 1, gain: .88 },
  flood: { bpm: 112, root: 38, chords: [0, -2, -4, -5], bass: [0, 4, 8, 12], arp: floodArp, drums: 2, lead: [12, 15, 10, 7], gain: .94 },
  boss: { bpm: 132, root: 36, chords: [0, 1, -2, 0], bass: [0, 3, 6, 8, 11, 14], arp: bossArp, drums: 2, lead: [13, 12, 19, 10], gain: 1 },
  victory: { bpm: 80, root: 43, chords: [0, -2, -5, -3], bass: [0, 8], arp: [0, null, 4, null, 7, null, 12, null, 11, null, 7, null, 4, null, 7, null], lead: [12, 16, 19, 16], gain: .82 },
  defeat: { bpm: 57, root: 36, chords: [0, -4, -5, -7], bass: [0], arp: [12, null, null, null, 10, null, null, null, 7, null, null, null, 3, null, null, null], gain: .67 }
};
export const musicNotes = {
  bass: note(triangle, 1, .998, .9, .11, 0, .08),
  arp: note(sine, 1, .997, .22, .062, 0, .017),
  lead: note(triangle, 1, 1.003, .65, .055, 0, .055),
  kick: note(sine, 110, 35, .22, .16),
  snare: note(noise, 2250, 700, .12, .09),
  hat: note(scratch, 5900, 4100, .05, .038)
};
