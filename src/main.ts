import './styles.css';
import { Game } from '@core/Game';
import { wireEngine } from '@core/loop';

const game = new Game(12345);
wireEngine(game);
