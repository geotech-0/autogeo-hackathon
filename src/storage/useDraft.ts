import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { readDraft, writeDraft } from './database';
export function useDraft<T>(key:string,initial:T|(()=>T)):readonly [T,Dispatch<SetStateAction<T>>,{ready:boolean;error:string|null}] {
 const [value,setValue]=useState<T>(initial);const [ready,setReady]=useState(false);const [error,setError]=useState<string|null>(null);const generation=useRef(0);
 useEffect(()=>{let alive=true;setReady(false);generation.current++;readDraft<T>(key).then(saved=>{if(alive&&saved!==undefined)setValue(saved);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)setReady(true);});return()=>{alive=false;};},[key]);
 useEffect(()=>{if(!ready)return;const token=generation.current;const timer=setTimeout(()=>{if(token===generation.current)writeDraft(key,value).catch(e=>setError(String(e)));},150);return()=>clearTimeout(timer);},[key,value,ready]);
 return [value,setValue,{ready,error}] as const;
}
