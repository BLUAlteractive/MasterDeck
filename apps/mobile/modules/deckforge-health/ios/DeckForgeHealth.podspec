Pod::Spec.new do |s|
  s.name = 'DeckForgeHealth'
  s.version = '0.0.1'
  s.summary = 'Read-only foreground DeckForge activity adapter'
  s.description = s.summary
  s.license = { :type => 'UNLICENSED' }
  s.author = 'DeckForge'
  s.homepage = 'https://github.com/BLUAlteractive/MasterDeck'
  s.platforms = { :ios => '16.0' }
  s.source = { :git => 'https://github.com/BLUAlteractive/MasterDeck.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'
  s.source_files = '**/*.{h,m,mm,swift}'
end
