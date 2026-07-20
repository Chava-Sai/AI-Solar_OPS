"""Ingest the selected SOLAR BOOKS into ChromaDB (Technical Library)."""
import sys, logging
sys.path.insert(0, ".")
logging.basicConfig(level=logging.WARNING)
from dotenv import load_dotenv; load_dotenv()
from app.ingestion.pipeline import ingest_document

# Selection rationale:
#   INCLUDED — operational/technical references engineers actually ask about.
#   EXCLUDED — "Making Renewable Reliable" (scanned images, no extractable text),
#              ANFIS MPPT academic paper (research, not common ops questions),
#              Common Questionnaire.docx (powers the FAQ cache instead).
BOOKS = {
    "6 Most Common & Critical Problems of Solar Inverters(1).pdf": "PV Technical",
    "Designing Your PV System_ Panels and MPPT Distribution!(1).pdf": "PV Technical",
    "Handbook for Solar PV(1).pdf": "PV Technical",
    "Health & Safety When Working on Solar PV Systems(1).pdf": "PV Technical",
    "Isolation Fault in PV system & Detection techniques(1).pdf": "PV Technical",
    "PVSyst Stand Alone System Guide (1).pdf": "PV Technical",
    "Solar PV Self Study Technical Training Book(1).pdf": "PV Technical",
    "Solar PV System Detailed Losses Definition (1).pdf": "PV Technical",
    "Solar PV System Operation & Maintenance(1).pdf": "PV Technical",
    "Solar PV System Post Evaluation Checklist(1).pdf": "PV Technical",
    "Best Practices In Operations & Maintenance of Solar PV(1).pdf": "PV Technical",
    "BESS Monitoring Systems(1).pdf": "BESS",
    "BESS Strategy for Commercial Buildings(1).pdf": "BESS",
    "BESS Testing and Inspection (1).pdf": "BESS",
    "Nrel solar best practices BESS.pdf": "BESS",
    "Technical Write Up - BESS (1).pdf": "BESS",
    "The era of Solar + BESS(1).pdf": "BESS",
}

BASE = "../SOLAR BOOKS/"
total = 0
for fname, cat in BOOKS.items():
    r = ingest_document(BASE + fname, category=cat, client_name="Technical Library")
    if r.get("status") == "success":
        total += r["chunks_created"]
        print(f"OK   {r['chunks_created']:5d} chunks  [{cat:12s}] {fname[:58]}", flush=True)
    else:
        print(f"FAIL {fname[:58]} -> {r.get('message','')[:80]}", flush=True)
print(f"\nTOTAL new chunks: {total}")
