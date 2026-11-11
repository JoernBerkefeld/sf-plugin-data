// Unit tests answer settle reads from fakes; the live pause between reads would only slow them.
import { readbackPace } from '../../lib/services/readback-pace.js';

readbackPace.sleep = async () => {};
