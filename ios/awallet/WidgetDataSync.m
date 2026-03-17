#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetDataSync, NSObject)

RCT_EXTERN_METHOD(saveMonthlyExpenseData:(NSDictionary *)data
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearMonthlyExpenseRevealState:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
