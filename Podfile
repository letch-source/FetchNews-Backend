# Uncomment the next line to define a global platform for your project
platform :ios, '15.0'

target 'FetchNews' do
  # Comment the next line if you don't want to use dynamic frameworks
  use_frameworks!

  # Pods for FetchNews
  pod 'GoogleSignIn', '~> 7.0'

  post_install do |installer|
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
        
        # Suppress warnings for AppAuth (harmless warnings from third-party library)
        if target.name.include?('AppAuth')
          # Suppress double-quoted include warnings
          config.build_settings['GCC_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER'] = 'NO'
          # Suppress deprecation warnings (AppAuth uses deprecated APIs for backward compatibility)
          config.build_settings['GCC_WARN_DEPRECATED_FUNCTIONS'] = 'NO'
          # Add compiler flags as backup
          config.build_settings['OTHER_CFLAGS'] ||= ['$(inherited)']
          config.build_settings['OTHER_CFLAGS'] << '-Wno-quoted-include-in-framework-header'
          config.build_settings['OTHER_CFLAGS'] << '-Wno-deprecated-declarations'
        end
      end
    end
    
    # Disable user script sandboxing for CocoaPods script phases
    # This fixes rsync permission issues when copying frameworks
    installer.aggregate_targets.each do |aggregate_target|
      aggregate_target.user_project.native_targets.each do |target|
        target.build_configurations.each do |config|
          # Disable sandboxing globally for this target's build configs
          # The CocoaPods script phases need to write to framework bundles
          config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
        end
      end
    end
  end
end

