import { SfError } from '@salesforce/core';
import { SfCommand } from '@salesforce/sf-plugins-core';

/** Retrieve command entry point reserved for a later implementation slice. */
export default class Retrieve extends SfCommand<void> {
  public static readonly summary = 'Retrieve portable Data360 configuration (not implemented).';

  /** Refuse operations until retrieval contracts and transport are implemented. */
  public async run(): Promise<void> {
    throw new SfError('Data360 retrieval is not implemented in this bootstrap.', 'NotImplemented');
  }
}
