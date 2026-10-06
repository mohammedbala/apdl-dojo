import { describe, it, beforeAll } from 'vitest';
import { checkErrorHunt, initKernel } from './validate';
import { errorHunts } from '../../src/content/errorhunt';

describe('error hunts', () => {
  beforeAll(initKernel);
  for (const h of errorHunts) it(`error hunt ${h.id} — ${h.title}`, () => checkErrorHunt(h));
});
