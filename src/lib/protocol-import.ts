export async function importProtocol(file:Pick<File,'name'|'size'|'arrayBuffer'|'text'>){
 const extension=file.name.toLowerCase().split('.').pop();
 if(extension==='doc')throw Error('For older .doc files, use Save As in Word to create a .docx file, then import it.');
 if(!['docx','txt','md'].includes(extension||''))throw Error('Choose a Word .docx, .txt or .md file.');
 if(file.size>2_000_000)throw Error('Choose a protocol file no larger than 2 MB.');
 let text:string;
 if(extension==='docx'){
  try{const mammoth=await import('mammoth/mammoth.browser');const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});text=result.value;}
  catch{throw Error('This Word document could not be read. Save an unencrypted .docx copy and try again.');}
 }else{text=await file.text();}
 text=text.replace(/^\uFEFF/,'').trim();
 if(!text)throw Error('The document has no readable text. Image-only documents need text recognition first.');
 if(text.length>20000)throw Error('The protocol exceeds 20,000 characters. Import a shorter version; no text has been replaced.');
 return text;
}
