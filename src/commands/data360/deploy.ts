import { SfError } from '@salesforce/core';
import { SfCommand } from '@salesforce/sf-plugins-core';

/** Deploy command entry point reserved for a later implementation slice. */
export default class Deploy extends SfCommand<void> {
  public static readonly summary = 'Deploy portable Data360 configuration (not implemented).';

  /** Refuse operations until deployment contracts and transport are implemented. */
  public async run(): Promise<void> {
    throw new SfError('Data360 deployment is not implemented in this bootstrap.', 'NotImplemented');
  }
}
