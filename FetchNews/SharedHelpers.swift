//
//  SharedHelpers.swift
//  FetchNews
//
//  Shared helper functions used across the app
//

import Foundation

/// Smart capitalization that preserves acronyms (AI, FC, etc.)
/// Only capitalizes first letter if the word is all lowercase
func smartCapitalized(_ text: String) -> String {
    let words = text.components(separatedBy: " ")
    return words.map { word in
        // If word is all uppercase or mixed case, keep it as-is
        if word == word.uppercased() || word != word.lowercased() {
            return word
        }
        // Otherwise, capitalize first letter only
        return word.prefix(1).uppercased() + word.dropFirst()
    }.joined(separator: " ")
}
