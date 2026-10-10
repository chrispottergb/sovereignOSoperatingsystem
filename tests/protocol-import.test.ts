import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {importProtocol} from '../src/lib/protocol-import';
it('extracts actual DOCX paragraphs as plain editable text',async()=>{const bytes=await readFile('tests/fixtures/protocol.docx');const text=await importProtocol(new File([bytes],'Protocol.DOCX'));expect(text).toBe('QLL test protocol\n\nPreserve the requested words.');});
it('retains text and markdown import',async()=>{expect(await importProtocol(new File(['# QLL\nRule'],'p.md'))).toBe('# QLL\nRule');});
it('rejects malformed, oversized and legacy files with actionable errors',async()=>{await expect(importProtocol(new File(['broken'],'p.docx'))).rejects.toThrow('could not be read');await expect(importProtocol(new File(['old'],'p.doc'))).rejects.toThrow('Save As');await expect(importProtocol(new File(['x'.repeat(2_000_001)],'p.docx'))).rejects.toThrow('2 MB');});
it('never silently truncates or replaces with empty extracted text',async()=>{await expect(importProtocol(new File(['x'.repeat(20001)],'p.txt'))).rejects.toThrow('20,000');await expect(importProtocol(new File(['   '],'p.txt'))).rejects.toThrow('no readable text');});
