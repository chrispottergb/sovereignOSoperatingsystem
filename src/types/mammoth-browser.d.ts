declare module 'mammoth/mammoth.browser' {
 const mammoth: {extractRawText(input:{arrayBuffer:ArrayBuffer}):Promise<{value:string;messages:{type:string;message:string}[]}>};
 export = mammoth;
}
