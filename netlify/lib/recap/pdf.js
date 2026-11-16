import {jsPDF} from 'jspdf';
export function buildRecapPdf(content){
 const doc=new jsPDF({unit:'pt',format:'letter',compress:false});
 doc.setFont('helvetica','normal');doc.setFontSize(16);doc.text('Enrollment recap',54,60);doc.setFontSize(11);
 const lines=doc.splitTextToSize(content,504);
 if(lines.length>43)throw Error('Recap exceeds one page.');
 doc.text(lines,54,94,{lineHeightFactor:1.35});
 return new Uint8Array(doc.output('arraybuffer'));
}
