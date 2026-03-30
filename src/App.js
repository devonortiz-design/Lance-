import React, { useState, useRef, useEffect, useCallback } from "react";
import { callClaude, speak, downloadDocx, readFile, detectDocumentContent, webSearch, formatSearchResults } from "./api";
import { loadMemory, loadRecentSessions, saveMessage, saveMemoryFact, saveSession, parseMemoryTags, stripMemoryTags } from "./memory";
import { SESSION_ID } from "./config";
import { LanceLogo, SendIcon, SpeakerIcon, StopIcon, DownloadIcon, AttachIcon, CloseIcon } from "./icons";