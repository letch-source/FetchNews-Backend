//
//  LocationView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

struct LocationView: View {
    @EnvironmentObject var vm: NewsVM
    @Environment(\.dismiss) private var dismiss
    @State private var newLocation = ""
    
    let commonLocations = [
        "New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia",
        "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville",
        "Fort Worth", "Columbus", "Charlotte", "San Francisco", "Indianapolis",
        "Seattle", "Denver", "Washington", "Boston", "El Paso", "Nashville",
        "Detroit", "Oklahoma City", "Portland", "Las Vegas", "Memphis", "Louisville"
    ]
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                // Header
                VStack(spacing: 8) {
                    Image(systemName: "location.fill")
                        .font(.system(size: 50))
                        .foregroundColor(.blue)
                    
                    Text("Set Your Location")
                        .font(.title2)
                        .fontWeight(.bold)
                    
                    Text("Get location-specific news")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 20)
                
                // Current location
                if !vm.userLocation.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Current Location")
                            .font(.headline)
                        Text(vm.userLocation)
                            .padding()
                            .background(Color.gray.opacity(0.1))
                            .cornerRadius(8)
                    }
                    .padding(.horizontal)
                }
                
                // Custom location input
                VStack(alignment: .leading, spacing: 8) {
                    Text("Enter Location")
                        .font(.headline)
                    TextField("City, State or Country", text: $newLocation)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .autocapitalization(.words)
                }
                .padding(.horizontal)
                
                // Common locations
                VStack(alignment: .leading, spacing: 12) {
                    Text("Popular Locations")
                        .font(.headline)
                        .padding(.horizontal)
                    
                    LazyVGrid(columns: [
                        GridItem(.flexible()),
                        GridItem(.flexible()),
                        GridItem(.flexible())
                    ], spacing: 8) {
                        ForEach(commonLocations, id: \.self) { location in
                            Button(action: {
                                newLocation = location
                            }) {
                                Text(location)
                                    .font(.caption)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(Color.blue.opacity(0.1))
                                    .foregroundColor(.blue)
                                    .cornerRadius(16)
                            }
                        }
                    }
                    .padding(.horizontal)
                }
                
                // Info message
                Text("Location will be saved locally for this session.")
                    .foregroundColor(.blue)
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                
                // Error message
                if let error = vm.lastError {
                    Text(error)
                        .foregroundColor(.red)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                
                // Save button
                Button(action: {
                    // Always save locally
                    vm.userLocation = newLocation
                    dismiss()
                }) {
                    Text("Set Location")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                }
                .disabled(newLocation.isEmpty)
                .padding(.horizontal)
                
                Spacer()
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            newLocation = vm.userLocation
        }
    }
}

#Preview {
    LocationView().environmentObject(NewsVM())
}
