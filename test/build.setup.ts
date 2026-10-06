import { build } from '../build.mjs';

export default async function setup(): Promise<void> {
  await build();
}
