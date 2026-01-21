/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationRecord } from '@google/gemini-cli-core';
import { partListUnionToString } from '@google/gemini-cli-core';
import type { Part } from '@google/genai';

/**
 * Converts session/conversation data into Gemini client history format for resuming chat.
 * This is adapted from the CLI's convertSessionToHistoryFormats function,
 * but only returns the clientHistory as we don't need uiHistory for the server.
 */
export function convertToClientHistory(
  messages: ConversationRecord['messages'],
): Array<{ role: 'user' | 'model'; parts: Part[] }> {
  const clientHistory: Array<{ role: 'user' | 'model'; parts: Part[] }> = [];

  for (const msg of messages) {
    // Skip system/error messages and user slash commands
    if (msg.type === 'info' || msg.type === 'error' || msg.type === 'warning') {
      continue;
    }

    if (msg.type === 'user') {
      // Skip user slash commands
      const contentString = partListUnionToString(msg.content);
      if (
        contentString.trim().startsWith('/') ||
        contentString.trim().startsWith('?')
      ) {
        continue;
      }

      // Add regular user message
      clientHistory.push({
        role: 'user',
        parts: [{ text: contentString }],
      });
    } else if (msg.type === 'gemini') {
      // Handle Gemini messages with potential tool calls
      const hasToolCalls =
        'toolCalls' in msg && msg.toolCalls && msg.toolCalls.length > 0;

      if (hasToolCalls) {
        // Create model message with function calls
        const modelParts: Part[] = [];

        // Add text content if present
        const contentString = partListUnionToString(msg.content);
        if (msg.content && contentString.trim()) {
          modelParts.push({ text: contentString });
        }

        // Add function calls
        for (const toolCall of msg.toolCalls!) {
          modelParts.push({
            functionCall: {
              name: toolCall.name,
              args: toolCall.args,
              ...(toolCall.id && { id: toolCall.id }),
            },
          });
        }

        clientHistory.push({
          role: 'model',
          parts: modelParts,
        });

        // Create single function response message with all tool call responses
        const functionResponseParts: Part[] = [];
        for (const toolCall of msg.toolCalls!) {
          if (toolCall.result) {
            // Convert PartListUnion result to function response format
            let responseData: Part;

            if (typeof toolCall.result === 'string') {
              responseData = {
                functionResponse: {
                  id: toolCall.id,
                  name: toolCall.name,
                  response: {
                    output: toolCall.result,
                  },
                },
              };
            } else if (Array.isArray(toolCall.result)) {
              // toolCall.result is an array containing properly formatted
              // function responses
              functionResponseParts.push(...(toolCall.result as Part[]));
              continue;
            } else {
              // Fallback for non-array results
              responseData = toolCall.result;
            }

            functionResponseParts.push(responseData);
          }
        }

        // Only add user message if we have function responses
        if (functionResponseParts.length > 0) {
          clientHistory.push({
            role: 'user',
            parts: functionResponseParts,
          });
        }
      } else {
        // Regular Gemini message without tool calls
        const contentString = partListUnionToString(msg.content);
        if (msg.content && contentString.trim()) {
          clientHistory.push({
            role: 'model',
            parts: [{ text: contentString }],
          });
        }
      }
    }
  }

  return clientHistory;
}
