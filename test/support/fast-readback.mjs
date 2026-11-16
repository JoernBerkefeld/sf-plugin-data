// Unit tests answer settle reads from fakes; the live pause between reads would only slow them.
import { readbackPace } from '../../lib/services/readback-pace.js';
import { connectRetry } from '../../lib/transport/connect-client.js';

readbackPace.sleep = async () => {};

// Transport retries back off for real seconds; fakes answer at once and tests assert warnings directly.
connectRetry.sleep = async () => {};
connectRetry.warn = () => {};
