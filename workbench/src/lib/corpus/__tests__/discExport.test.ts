// Where Diogenes' exporter puts a work. Building and running the export moved
// into Rust (src-tauri/src/jobs.rs, commands.rs), with its tests.
import { describe, expect, it } from 'vitest';
import { exportedWorkPath } from '../discExport';

describe('exportedWorkPath', () => {
  it('names the file the way Diogenes really names it', () => {
    // Verified against real output: tlg0059030.xml is Respublica.
    expect(exportedWorkPath('/tmp/out', 'tlg', '0059', '030')).toBe(
      '/tmp/out/Diogenes-Resources/xml/tlg/tlg0059030.xml',
    );
  });

  it('tolerates a trailing slash on the export dir', () => {
    expect(exportedWorkPath('/tmp/out/', 'tlg', '0086', '001')).toBe(
      '/tmp/out/Diogenes-Resources/xml/tlg/tlg0086001.xml',
    );
  });
});
