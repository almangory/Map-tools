import { matchStatusByColor, hexToRgb } from './services/colorUtils.ts';
console.log(matchStatusByColor('#D86DCD'));
console.log(matchStatusByColor('D86DCD'));
console.log(matchStatusByColor('#FFD86DCD'));
console.log(hexToRgb('#FFD86DCD'));
