import { suite } from './validate';
import { lessons } from '../../src/content/lessons/t9';
import { challenges } from '../../src/content/challenges/t9';
suite('track t9', lessons, challenges);
