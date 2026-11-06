#!/usr/bin/env python3
"""Safely rename a legacy Excel worksheet named History to Riwayat."""
import os
import re
import sys
import tempfile
import zipfile


def main():
    if len(sys.argv) != 2:
        print('Usage: repair-history-sheet.py <xlsx-file>', file=sys.stderr)
        return 2

    workbook_path = os.path.abspath(sys.argv[1])
    if not os.path.isfile(workbook_path):
        return 0

    with zipfile.ZipFile(workbook_path, 'r') as source:
        try:
            workbook_xml = source.read('xl/workbook.xml')
        except KeyError:
            print('File bukan workbook XLSX yang valid (xl/workbook.xml tidak ditemukan).', file=sys.stderr)
            return 3

        # Only change the worksheet's name attribute; all worksheet data,
        # relationships, drawings, and embedded images remain untouched.
        pattern = re.compile(rb'(<sheet\b[^>]*\bname=["\'])History(["\'])', re.IGNORECASE)
        repaired_xml, count = pattern.subn(rb'\g<1>Riwayat\2', workbook_xml)
        if count == 0:
            return 0

        fd, temp_path = tempfile.mkstemp(prefix='.inventaris-migrate-', suffix='.xlsx', dir=os.path.dirname(workbook_path))
        os.close(fd)
        try:
            with zipfile.ZipFile(temp_path, 'w', compression=zipfile.ZIP_DEFLATED) as target:
                for info in source.infolist():
                    data = repaired_xml if info.filename == 'xl/workbook.xml' else source.read(info.filename)
                    target.writestr(info, data)
            # Verify the rewritten archive before replacing the original.
            with zipfile.ZipFile(temp_path, 'r') as check:
                bad_file = check.testzip()
                if bad_file:
                    raise RuntimeError(f'ZIP rusak pada {bad_file}')
                check.read('xl/workbook.xml')
            os.replace(temp_path, workbook_path)
            print('Migrasi database: sheet History diubah menjadi Riwayat. Data tetap dipertahankan.')
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
