# Actionable items, decisions, questions extraction with chunking support

import os
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
from langchain_text_splitters import RecursiveCharacterTextSplitter

def get_llm():
    return ChatGroq(
        model="llama-3.1-8b-instant",
        groq_api_key=os.getenv("GROQ_API_KEY"),
        temperature=0.3
    )

def split_transcript(transcript: str, chunk_size: int = 15000) -> list:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=1000
    )
    return splitter.split_text(transcript)

def extract_chunked(transcript: str, system_prompt: str, combine_prompt: str, fallback_msg: str) -> str:
    llm = get_llm()
    chunks = split_transcript(transcript)
    
    map_chain = (
        RunnablePassthrough() 
        | RunnableLambda(lambda x: {"text": x}) 
        | ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "{text}"),
        ]) 
        | llm 
        | StrOutputParser()
    )
    
    chunk_results = []
    for chunk in chunks:
        res = map_chain.invoke(chunk)
        # Filter out negative empty/none findings
        res_lower = res.lower().strip()
        if res_lower and "no " not in res_lower and "none found" not in res_lower and "no action" not in res_lower and "no decision" not in res_lower:
            chunk_results.append(res)
            
    if not chunk_results:
        return fallback_msg
        
    combined_text = "\n\n".join(chunk_results)
    
    combined_chain = (
        RunnablePassthrough() 
        | RunnableLambda(lambda x: {"text": x}) 
        | ChatPromptTemplate.from_messages([
            ("system", combine_prompt),
            ("human", "{text}"),
        ]) 
        | llm 
        | StrOutputParser()
    )
    
    return combined_chain.invoke(combined_text)

def extract_action_items(transcript: str) -> str:
    return extract_chunked(
        transcript=transcript,
        system_prompt=(
            "You are an expert meeting analyst. Extract all action items from this meeting transcript chunk. "
            "For each action item, provide:\n"
            "- Task description\n"
            "- Owner (who is responsible)\n"
            "- Deadline (if mentioned, else write 'Not specified')\n\n"
            "Format as a bulleted or numbered list. If none found, write 'None found.'"
        ),
        combine_prompt=(
            "You are an expert meeting analyst. Below are raw action items extracted from different parts of a meeting transcript.\n"
            "Consolidate them into a single, clean, professionally formatted numbered list.\n"
            "Deduplicate any identical or very similar tasks, merging information if necessary.\n"
            "If the input list is empty or contains no tasks, respond with 'No action items found.'"
        ),
        fallback_msg="No action items found."
    )

def extract_key_decisions(transcript: str) -> str:
    return extract_chunked(
        transcript=transcript,
        system_prompt=(
            "You are an expert meeting analyst. Extract all key decisions made from this meeting transcript chunk.\n"
            "Format as a bulleted or numbered list. If none found, write 'None found.'"
        ),
        combine_prompt=(
            "You are an expert meeting analyst. Below are raw key decisions extracted from different parts of a meeting transcript.\n"
            "Consolidate them into a single, clean, professionally formatted numbered list.\n"
            "Deduplicate similar decisions and present them clearly.\n"
            "If the input list is empty or contains no decisions, respond with 'No key decisions found.'"
        ),
        fallback_msg="No key decisions found."
    )

def extract_questions(transcript: str) -> str:
    return extract_chunked(
        transcript=transcript,
        system_prompt=(
            "From the meeting transcript chunk, extract all unresolved questions, doubts, or topics needing follow-up.\n"
            "Format as a bulleted or numbered list. If none found, write 'None found.'"
        ),
        combine_prompt=(
            "Below are raw unresolved questions or topics needing follow-up extracted from different parts of a meeting transcript.\n"
            "Consolidate them into a single clean, professionally formatted numbered list.\n"
            "Deduplicate similar questions.\n"
            "If the input list is empty or contains no questions, respond with 'No open questions found.'"
        ),
        fallback_msg="No open questions found."
    )