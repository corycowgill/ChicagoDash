// Words and facts: the Chicago voice of the game.

/** True Chicago facts, shown while loading and on the game-over card. */
export const FACTS = [
  'The "L" has rattled around the Loop since 1892.',
  'In 1900 Chicago reversed the flow of its river so it runs away from the lake.',
  'The river is dyed green every St. Patrick\'s Day, a tradition since 1962.',
  'The four stars on the city flag stand for Fort Dearborn, the Great Fire of 1871, the 1893 World\'s Fair and the 1933 Century of Progress.',
  'The first Ferris wheel spun at Chicago\'s 1893 World\'s Fair.',
  'Cloud Gate, "the Bean", is 168 stainless-steel plates welded with no visible seams.',
  'Wrigley Field opened in 1914. Its outfield ivy was planted in 1937.',
  'State and Madison is the zero point of the street grid: 0 North, 0 South, 0 East, 0 West.',
  'Eight blocks make a mile on the Chicago grid.',
  'Buckingham Fountain was dedicated in 1927 and its centre jet shoots about 150 feet up.',
  'Lincoln Park Zoo is one of the oldest zoos in North America, and admission has always been free.',
  'A Chicago-style hot dog is "dragged through the garden": mustard, onion, relish, tomato, pickle, sport peppers and celery salt on a poppy-seed bun. No ketchup.',
  'Marina City\'s corncob towers have a spiral parking garage in their bottom 19 floors.',
  'Chicago has 26 miles of public lakefront, almost all of it parkland.',
  'The Picasso in Daley Plaza has no official title, and Picasso never said what it is.',
  'The Art Institute lions have worn Cubs caps, Bears helmets, Blackhawks helmets and holiday wreaths.',
  'Chicagoans call the Willis Tower the Sears Tower, and probably always will.',
  'After a snowstorm, a lawn chair in a shoveled parking spot means "dibs". Respect the chair.',
];

/** Cheers for clearing an obstacle in style. */
export const CHEERS = [
  'Ope! Just squeezin\' past ya!',
  'Da Bears!',
  'That\'s a heater!',
  'Hey, nice!',
  'Smooth as Lake Shore Drive at 5 a.m.',
  'Fly the W!',
  'Faster than the Brown Line!',
  'Like a Chicago pro!',
];

/** What you say when you hit something but keep going. */
export const OUCHES = ['Ope! Sorry!', 'Construction season strikes!', 'Ope!', 'Watch it, pal!', 'Oof, that\'s a pothole!'];

/** Game-over titles. */
export const GAME_OVER = [
  'Game Over',
  'Ope!',
  'Da Bears... fell',
  'Should\'ve taken the Blue Line',
  'Construction season wins',
  'Dibs on a rematch',
  'Delayed. Signal problems.',
];

/** Real intersections for the green street signs, per neighbourhood. */
export const STREETS = {
  loop: [['W MADISON ST', 'N STATE ST', '0 N · 0 E · CENTER OF THE GRID'], ['W LAKE ST', 'N CLARK ST'], ['W JACKSON BLVD', 'S LA SALLE ST'], ['E RANDOLPH ST', 'N WABASH AVE']],
  millennium: [['E MONROE ST', 'S MICHIGAN AVE'], ['E RANDOLPH ST', 'N COLUMBUS DR'], ['E JACKSON DR', 'S LAKE SHORE DR']],
  riverwalk: [['E WACKER DR', 'N MICHIGAN AVE'], ['W WACKER DR', 'N DEARBORN ST'], ['W WACKER DR', 'N STATE ST']],
  wrigley: [['W ADDISON ST', 'N CLARK ST'], ['W WAVELAND AVE', 'N SHEFFIELD AVE'], ['W ADDISON ST', 'N SHEFFIELD AVE']],
  lincoln: [['W FULLERTON AVE', 'N LAKE SHORE DR'], ['W ARMITAGE AVE', 'N CLARK ST'], ['W DIVERSEY PKWY', 'N CANNON DR']],
};

/** Festival banners strung across Millennium Park paths. */
export const FESTIVALS = ['BLUES FEST', 'TASTE OF CHICAGO', 'JAZZ FEST', 'AIR & WATER SHOW', 'HOUSE MUSIC FEST'];

export function pick(a) {
  return a[(Math.random() * a.length) | 0];
}
