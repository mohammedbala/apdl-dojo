import { suite } from './validate';
import { lessons } from '../../src/content/lessons/t10';
import { challenges } from '../../src/content/challenges/t10';
suite('track t10', lessons, challenges);
