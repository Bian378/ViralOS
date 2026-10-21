/**
 * Streaming, fail-closed byte integrity verifier for FUTURE private MP4 store.
 * No network, no filename-based permission, no media import API, and no
 * publishing authorization. Call with a PRIVATE authenticated storage reader.
 * A valid ftyp header and hash do not guarantee playable video, media rights,
 * safe content or speech-aligned captions: ffprobe and human checks are extra.
 */
import {createHash} from 'node:crypto';

export type PrivateMediaByteProof={
  sha256:string;bytes:number;
  mimeType:'video/mp4';hasMp4FileTypeBox:true;
  metadataDecoded:false;
  humanMediaRightsApproved:false;
  youtubeUploadAuthorized:false;
};
const MAX_BYTES=150*1024*1024;
const SHA=/^[a-f0-9]{64}$/;

export async function verifyPrivateMp4ByteStream(
  readable:AsyncIterable<Uint8Array>,
  expectedSha256:string,
  maxBytes=MAX_BYTES
):Promise<PrivateMediaByteProof>{
  if(!SHA.test(expectedSha256)||!Number.isSafeInteger(maxBytes)||
     maxBytes<1024||maxBytes>MAX_BYTES||
     !readable||typeof readable[Symbol.asyncIterator]!=='function')
    throw Error('Private video reader and expected SHA-256 are required.');
  const hash=createHash('sha256');
  let bytes=0,header:Uint8Array<ArrayBufferLike>=new Uint8Array(0);
  for await (const chunk of readable){
    if(!(chunk instanceof Uint8Array))
      throw Error('Private storage returned a non-byte chunk.');
    if(!chunk.length)continue;
    bytes+=chunk.byteLength;
    if(bytes>maxBytes)throw Error('Stored MP4 exceeds the configured size limit.');
    hash.update(chunk);
    if(header.length<16){
      const count=Math.min(chunk.length,16-header.length);
      const next=new Uint8Array(header.length+count);
      next.set(header,0);next.set(chunk.subarray(0,count),header.length);
      header=next;
    }
  }
  if(bytes<1024||header.length<12||
     header[4]!==0x66||header[5]!==0x74||
     header[6]!==0x79||header[7]!==0x70)
    throw Error('Stored file is not an MP4 file-type container.');
  // Header alone is only a cheap reject filter, NOT ffprobe validation.
  const actual=hash.digest('hex');
  if(actual!==expectedSha256)
    throw Error('Stored media SHA-256 does not match the saved local draft.');
  return {
    sha256:actual,bytes,mimeType:'video/mp4',hasMp4FileTypeBox:true,
    metadataDecoded:false,humanMediaRightsApproved:false,
    youtubeUploadAuthorized:false,
  };
}
